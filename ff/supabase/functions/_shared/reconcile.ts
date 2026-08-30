/**
 * The prompt and the validator for the reconciliation model call.
 *
 * Mirrors `src/domain/reconciliation/aiVerdict.ts`, which is the client-side
 * copy. The duplication is deliberate and matches how `report.ts` and
 * `receipt.ts` already work here: edge functions run on Deno and cannot
 * import from the Vite tree. Change one, change the other.
 *
 * The model is asked one narrow question about a handful of pairs the
 * deterministic engine could not settle — never to reconcile a statement.
 */

export interface MatchQuestion {
  id: string;
  movementDescription: string;
  expenseDescription: string;
  movementAmount: number;
  expenseAmount: number;
  movementDate: string;
  expenseDate: string;
}

export interface MatchVerdict {
  id: string;
  match: boolean;
  confidence: number;
  reason: string;
  merchant: string | null;
}

/** Enough to disambiguate a statement, few enough to stay one cheap call. */
export const MAX_PAIRS = 20;

export const RECONCILE_SYSTEM_PROMPT = `Compará movimientos de una tarjeta de crédito argentina con gastos que el usuario cargó a mano en su app de finanzas.

Para cada par decidís si son el MISMO consumo.

Devolvé UN objeto JSON y nada más. Sin explicaciones, sin markdown, sin \`\`\`.

Esquema:
{
  "verdicts": [
    {
      "id": string,
      "match": boolean,
      "confidence": number,
      "reason": string,
      "merchant": string|null
    }
  ]
}

Reglas:
- "id" tiene que ser exactamente el id del par que recibiste. Devolvé un veredicto por cada par, ni uno más.
- "confidence" va de 0 a 1 y expresa tu certeza sobre la decisión que tomaste.
- Los resúmenes de tarjeta escriben el comercio a través del procesador de pago: "PAYU*AR*UBER", "MERPAGO*CARREFOUR", "DL*SPOTIFY" son Uber, Carrefour y Spotify.
- Una diferencia de uno a tres días entre el consumo y la fecha de la app es normal: la tarjeta imputa después.
- Una diferencia de monto puede venir de propinas, recargos o del tipo de cambio del día. No alcanza por sí sola para descartar.
- Comercios distintos NO son el mismo consumo aunque el monto y la fecha coincidan.
- "merchant" es el nombre limpio del comercio ("Uber", "Carrefour"), o null si no lo podés identificar.
- "reason" es una frase corta en español explicando la decisión.
- No inventes pares que no recibiste.`;

/** The pairs, as compact JSON. Only what the decision needs — no ids of ours. */
export function buildPrompt(pairs: MatchQuestion[]): string {
  return JSON.stringify({
    pairs: pairs.map((p) => ({
      id: p.id,
      tarjeta: { descripcion: p.movementDescription, monto: p.movementAmount, fecha: p.movementDate },
      app: { descripcion: p.expenseDescription, monto: p.expenseAmount, fecha: p.expenseDate },
    })),
  });
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Validate the model's reply against the ids that were actually asked about.
 *
 * Anything malformed, duplicated or invented is dropped rather than coerced:
 * a verdict only gets to move a score if it came back in the shape it was
 * asked for, for a pair that exists.
 */
export function parseVerdicts(raw: unknown, askedIds: string[]): MatchVerdict[] {
  const allowed = new Set(askedIds);
  const list =
    Array.isArray(raw) ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { verdicts?: unknown }).verdicts)
      ? (raw as { verdicts: unknown[] }).verdicts
      : [];

  const seen = new Set<string>();
  const out: MatchVerdict[] = [];

  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const data = item as Record<string, unknown>;

    const id = typeof data.id === 'string' ? data.id.trim() : '';
    if (!id || !allowed.has(id) || seen.has(id)) continue;
    if (typeof data.match !== 'boolean') continue;
    if (typeof data.confidence !== 'number' || !Number.isFinite(data.confidence)) continue;

    const merchant = typeof data.merchant === 'string' ? data.merchant.trim() : '';

    seen.add(id);
    out.push({
      id,
      match: data.match,
      confidence: clamp01(data.confidence),
      reason: typeof data.reason === 'string' ? data.reason.trim().slice(0, 300) : '',
      merchant: merchant ? merchant.slice(0, 80) : null,
    });
  }

  return out;
}

/** Validate the request body. Returns null when it is not usable. */
export function parseQuestions(raw: unknown): MatchQuestion[] | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const pairs = (raw as { pairs?: unknown }).pairs;
  if (!Array.isArray(pairs) || pairs.length === 0) return null;

  const out: MatchQuestion[] = [];
  for (const item of pairs.slice(0, MAX_PAIRS)) {
    if (typeof item !== 'object' || item === null) continue;
    const p = item as Record<string, unknown>;
    const id = typeof p.id === 'string' ? p.id.trim().slice(0, 120) : '';
    const movementDescription =
      typeof p.movementDescription === 'string' ? p.movementDescription.trim().slice(0, 200) : '';
    const expenseDescription =
      typeof p.expenseDescription === 'string' ? p.expenseDescription.trim().slice(0, 200) : '';
    if (!id || !movementDescription || !expenseDescription) continue;

    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const day = (v: unknown) =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';

    out.push({
      id,
      movementDescription,
      expenseDescription,
      movementAmount: num(p.movementAmount),
      expenseAmount: num(p.expenseAmount),
      movementDate: day(p.movementDate),
      expenseDate: day(p.expenseDate),
    });
  }

  return out.length > 0 ? out : null;
}
