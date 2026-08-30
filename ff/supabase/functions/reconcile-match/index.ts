/**
 * Resolves the reconciliation pairs the deterministic engine could not settle.
 *
 * Deliberately narrow. The client has already normalized, generated
 * candidates, scored them and locked in everything the rules answer on their
 * own; what arrives here is at most twenty ambiguous descriptor pairs and the
 * only question asked is "same merchant?". No statement is uploaded, no table
 * is read on the caller's behalf, and nothing is written.
 *
 * ── Why this file has no `../_shared/` imports ──────────────────────────────
 *
 * A deploy that uploads only the function's own directory resolves
 * `../_shared/ai.ts` outside the bundle root and fails at bundle time:
 *
 *   Module not found "file:///…/_shared/ai.ts" at …/source/index.ts
 *
 * That is only survivable from a full `supabase functions deploy` run at the
 * repo root, which not every deploy path is. So this function is
 * self-contained, exactly as `analyze-receipt` already inlines its own copy
 * of the receipt parser.
 *
 * Two consequences, both deliberate:
 *   - The provider below is `_shared/ai.ts` trimmed to text completion. It
 *     keeps the same secrets, the same user-key-wins precedence and the same
 *     `AI_PROVIDER` / `AI_MODEL` behaviour. Change one, change the other.
 *   - The verdict validator mirrors
 *     `src/domain/reconciliation/aiVerdict.ts` on the client, the same way
 *     `_shared/report.ts` mirrors `services/ai/types.ts`.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ─── CORS ────────────────────────────────────────────────────────────────────
// The allow-list is the load-bearing part: supabase-js sends `apikey`,
// `x-client-info`, `x-retry-count` and `x-region` alongside `Authorization`,
// and a preflight that omits any announced header makes the browser drop the
// POST with nothing in the function logs. Mirrors `_shared/cors.ts`.

const ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-retry-count',
  'x-region',
].join(', ');

function allowedOrigin(requestOrigin: string | null): { origin: string; vary: boolean } {
  const configured = Deno.env.get('ALLOWED_ORIGIN')?.trim();
  if (!configured || configured === '*') return { origin: '*', vary: false };

  const list = configured.split(',').map((o) => o.trim()).filter(Boolean);
  if (requestOrigin && list.includes(requestOrigin)) return { origin: requestOrigin, vary: true };
  return { origin: list[0] ?? '*', vary: true };
}

function corsHeaders(req: Request): Record<string, string> {
  const { origin, vary } = allowedOrigin(req.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    ...(vary ? { Vary: 'Origin' } : {}),
  };
}

const preflight = (req: Request) => new Response(null, { status: 204, headers: corsHeaders(req) });

const jsonResponse = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });

// ─── model access ────────────────────────────────────────────────────────────
// `_shared/ai.ts` without the vision half, which this function never uses.
// The API keys are Deno env secrets and must never move to the client: Vite
// inlines anything `VITE_*` into the public bundle.

type ProviderName = 'gemini' | 'groq' | 'openai' | 'anthropic';

interface TextRequest {
  system: string;
  prompt: string;
  json?: boolean;
  temperature?: number;
}

interface CompletionProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(req: TextRequest): Promise<string>;
}

/**
 * No key anywhere — neither the user's nor the project's. Distinct from a
 * model failure because retrying cannot fix it: the user adds a key in
 * Settings, or an operator sets the secret.
 */
class MissingApiKeyError extends Error {
  constructor(readonly provider: ProviderName) {
    super(`no API key configured for ${provider}`);
    this.name = 'MissingApiKeyError';
  }
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

const KEY_ENV: Record<ProviderName, string> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * The user's key wins; the project secret is the fallback. Blank strings
 * count as absent — the Settings screen persists an empty field for every
 * provider the user left untouched.
 */
function resolveKey(provider: ProviderName, userKey?: string): string {
  const fromUser = userKey?.trim();
  if (fromUser) return fromUser;
  const fromEnv = Deno.env.get(KEY_ENV[provider])?.trim();
  if (fromEnv) return fromEnv;
  throw new MissingApiKeyError(provider);
}

function gemini(model: string, apiKey?: string): CompletionProvider {
  return {
    name: 'gemini',
    model,
    complete: async ({ system, prompt, json, temperature = 0.2 }) => {
      const key = resolveKey('gemini', apiKey);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              ...(json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        },
      );
      if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? '')
          .join('') ?? ''
      );
    },
  };
}

function anthropic(model: string, apiKey?: string): CompletionProvider {
  return {
    name: 'anthropic',
    model,
    complete: async ({ system, prompt, temperature = 0.2 }) => {
      const key = resolveKey('anthropic', apiKey);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (
        data?.content
          ?.filter((b: { type?: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text ?? '')
          .join('') ?? ''
      );
    },
  };
}

/** Groq and OpenAI share the chat-completions shape. */
function openaiCompatible(
  name: 'groq' | 'openai',
  model: string,
  url: string,
  apiKey?: string,
): CompletionProvider {
  return {
    name,
    model,
    complete: async ({ system, prompt, json, temperature = 0.2 }) => {
      const key = resolveKey(name, apiKey);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? '';
    },
  };
}

const PROVIDER_NAMES: ProviderName[] = ['gemini', 'groq', 'openai', 'anthropic'];

interface UserApiKeys {
  gemini?: string;
  groq?: string;
  openai?: string;
  anthropic?: string;
  provider?: string;
}

const asProvider = (raw?: string): ProviderName | null => {
  const name = raw?.trim().toLowerCase();
  return name && PROVIDER_NAMES.includes(name as ProviderName) ? (name as ProviderName) : null;
};

/**
 * The provider the user picked in Settings, falling back to the
 * `AI_PROVIDER` / `AI_MODEL` secrets, and finally to Gemini 2.5 Flash.
 */
function getProvider(apiKeys?: UserApiKeys): CompletionProvider {
  const envProvider = asProvider(Deno.env.get('AI_PROVIDER'));
  const name = asProvider(apiKeys?.provider) ?? envProvider ?? 'gemini';

  // `AI_MODEL` names a model for the provider `AI_PROVIDER` selects. Applying
  // it to a different provider sends a Gemini model id to Anthropic and earns
  // a 404 — so it only counts when the resolved provider is that one.
  const envModel = Deno.env.get('AI_MODEL')?.trim();
  const model = envModel && name === (envProvider ?? 'gemini') ? envModel : DEFAULT_MODELS[name];

  switch (name) {
    case 'groq':
      return openaiCompatible('groq', model, 'https://api.groq.com/openai/v1/chat/completions', apiKeys?.groq);
    case 'openai':
      return openaiCompatible('openai', model, 'https://api.openai.com/v1/chat/completions', apiKeys?.openai);
    case 'anthropic':
      return anthropic(model, apiKeys?.anthropic);
    default:
      return gemini(model, apiKeys?.gemini);
  }
}

/**
 * Pulls the first balanced JSON object out of a response. Even with a JSON
 * response format, models still occasionally wrap the object in prose or a
 * ``` fence.
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace matching
  }

  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error('No JSON object in model response');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  throw new Error('Unterminated JSON object in model response');
}

// ─── the question, and the shape of an answer ────────────────────────────────

interface MatchQuestion {
  id: string;
  movementDescription: string;
  expenseDescription: string;
  movementAmount: number;
  expenseAmount: number;
  movementDate: string;
  expenseDate: string;
}

interface MatchVerdict {
  id: string;
  match: boolean;
  confidence: number;
  reason: string;
  merchant: string | null;
}

/** Enough to disambiguate a statement, few enough to stay one cheap call. */
const MAX_PAIRS = 20;

const RECONCILE_SYSTEM_PROMPT = `Compará movimientos de una tarjeta de crédito argentina con gastos que el usuario cargó a mano en su app de finanzas.

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
- La app la escribe una persona, así que muchas veces pone el RUBRO y no el comercio: "nafta" es una estación de servicio ("Est servicio", "Shell", "YPF", "Axion"), "super" es un supermercado ("Carrefour", "Coto", "Disco"), "farmacia" es "Farmacity", "delivery" es "Rappi" o "PedidosYa". Si el rubro que escribió se corresponde con lo que vende ese comercio, es el mismo consumo.
- Comercios distintos NO son el mismo consumo aunque el monto y la fecha coincidan. Un supermercado y un servicio de streaming que cuestan lo mismo el mismo día son una casualidad, no un match.
- "merchant" es el nombre limpio del comercio ("Uber", "Carrefour"), o null si no lo podés identificar.
- "reason" es una frase corta en español explicando la decisión.
- No inventes pares que no recibiste.`;

/** The pairs, as compact JSON. Only what the decision needs. */
function buildPrompt(pairs: MatchQuestion[]): string {
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
function parseVerdicts(raw: unknown, askedIds: string[]): MatchVerdict[] {
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
function parseQuestions(raw: unknown): MatchQuestion[] | null {
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
    const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

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

// ─── handler ─────────────────────────────────────────────────────────────────

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 25);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const pairs = parseQuestions(body);
  if (!pairs) return json({ error: 'invalid_body' }, 400);

  // Resolved before the quota is claimed, so a missing key never burns a call.
  let provider: CompletionProvider;
  try {
    provider = getProvider(user.user_metadata?.apiKeys);
  } catch (e) {
    if (e instanceof MissingApiKeyError) return json({ error: 'no_api_key', provider: e.provider }, 400);
    throw e;
  }

  const admin = createClient(url, serviceKey);
  const { data: allowed } = await admin.rpc('claim_ai_call', {
    p_user_id: user.id,
    p_daily_limit: DAILY_LIMIT,
  });
  if (allowed === false) return json({ error: 'rate_limited', limit: DAILY_LIMIT }, 429);

  try {
    const raw = await provider.complete({
      system: RECONCILE_SYSTEM_PROMPT,
      prompt: buildPrompt(pairs),
      json: true,
      temperature: 0,
    });
    const verdicts = parseVerdicts(extractJson(raw), pairs.map((p) => p.id));
    return json({ verdicts, provider: provider.name, model: provider.model });
  } catch (e) {
    if (e instanceof MissingApiKeyError) return json({ error: 'no_api_key', provider: e.provider }, 400);
    console.error('reconcile model call failed', e);
    return json({ error: 'ai_failed' }, 502);
  }
});
