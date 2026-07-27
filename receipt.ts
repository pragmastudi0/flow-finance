import { fold, type TxType } from './categories.ts';
import { guessCategory, normalizeNumber, type Currency, type Learning } from './parser.ts';

/**
 * Receipt analysis, split so that only the network call needs a server.
 *
 * Everything here is pure: the prompt, the validation of whatever the model
 * returns, and the mapping to a transaction draft. The model is not trusted —
 * it is a text generator that will occasionally invent a field, return a total
 * as "1.234,56", or hallucinate a date in 2019. `parseReceiptResponse` is the
 * boundary where that gets contained.
 */

export interface ReceiptItem {
  description: string;
  quantity: number | null;
  amount: number | null;
}

export interface ReceiptExtraction {
  merchant: string | null;
  total: number;
  currency: Currency;
  date: string | null;
  items: ReceiptItem[];
  /** The model's own confidence, 0–1. Below `REVIEW_THRESHOLD` we ask the user. */
  confidence: number;
}

/** Under this confidence the UI should open the edit form instead of saving. */
export const REVIEW_THRESHOLD = 0.7;

/** Receipts older than this are almost certainly a misread date. */
const MAX_AGE_DAYS = 400;

export const RECEIPT_PROMPT = `Analizás fotos de tickets y facturas de compra argentinos.

Devolvé UN objeto JSON y nada más. Sin explicaciones, sin markdown, sin \`\`\`.

Esquema:
{
  "merchant": string|null,   // nombre del comercio tal como figura
  "total": number,           // TOTAL final pagado, con decimales, punto decimal
  "currency": "ARS"|"USD",
  "date": string|null,       // fecha de la compra, formato YYYY-MM-DD
  "items": [{ "description": string, "quantity": number|null, "amount": number|null }],
  "confidence": number       // 0 a 1: qué tan seguro estás de haber leído bien el total
}

Reglas:
- El total es el importe final efectivamente pagado. Si el ticket muestra
  subtotal, descuentos e IVA, devolvé el TOTAL, no el subtotal.
- Los tickets argentinos usan punto como separador de miles y coma como decimal
  ("1.234,56"). Convertí a número: 1234.56
- Si no podés leer el total con confianza, igual devolvé tu mejor estimación y
  bajá "confidence".
- Si la imagen no es un ticket ni una factura, devolvé "total": 0 y
  "confidence": 0.
- "items" puede ir vacío si no se leen los renglones. No inventes renglones.
- No inventes el comercio ni la fecha: si no se leen, devolvé null.`;

/** Strip markdown fences and any prose around the JSON object. */
function extractJsonObject(raw: string): unknown {
  const withoutFences = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Accept both 1234.56 and "1.234,56". */
function coerceAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = normalizeNumber(value.replace(/[^\d.,-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceDate(value: unknown, today: Date): string | null {
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    parsed.getFullYear() !== Number(y) ||
    parsed.getMonth() !== Number(m) - 1 ||
    parsed.getDate() !== Number(d)
  ) {
    return null; // e.g. 2026-02-31
  }

  // A receipt cannot be from the future, and a very old one is a misread.
  const ageDays = (today.getTime() - parsed.getTime()) / 86_400_000;
  if (ageDays < -1 || ageDays > MAX_AGE_DAYS) return null;

  return `${y}-${m}-${d}`;
}

function coerceItems(value: unknown): ReceiptItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .map((raw) => {
      if (typeof raw !== 'object' || raw === null) return null;
      const item = raw as Record<string, unknown>;
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      if (!description) return null;
      return {
        description: description.slice(0, 200),
        quantity: coerceAmount(item.quantity),
        amount: coerceAmount(item.amount),
      };
    })
    .filter((i): i is ReceiptItem => i !== null);
}

/**
 * Validate and normalize a model response.
 * Returns `null` when nothing usable came back — no total, or not a receipt.
 */
export function parseReceiptResponse(
  raw: string,
  { today = new Date() }: { today?: Date } = {},
): ReceiptExtraction | null {
  const parsed = extractJsonObject(raw);
  if (typeof parsed !== 'object' || parsed === null) return null;

  const data = parsed as Record<string, unknown>;

  const total = coerceAmount(data.total);
  if (total === null || total <= 0) return null;

  const merchantRaw = typeof data.merchant === 'string' ? data.merchant.trim() : '';
  const merchant = merchantRaw ? merchantRaw.slice(0, 120) : null;

  const confidence =
    typeof data.confidence === 'number' && Number.isFinite(data.confidence)
      ? Math.min(Math.max(data.confidence, 0), 1)
      : 0.5;
  if (confidence === 0) return null;

  return {
    merchant,
    total,
    currency: fold(String(data.currency ?? '')) === 'usd' ? 'USD' : 'ARS',
    date: coerceDate(data.date, today),
    items: coerceItems(data.items),
    confidence,
  };
}

/**
 * Everything on the receipt that could hint at a category: the merchant plus
 * the line items. Merchant first — it is by far the stronger signal.
 */
export function categorizationText(extraction: ReceiptExtraction): string {
  return [extraction.merchant ?? '', ...extraction.items.map((i) => i.description)]
    .filter(Boolean)
    .join(' ');
}

export interface ReceiptDraft {
  amount: number;
  currency: Currency;
  fxRate: number;
  type: TxType;
  category: string;
  description: string;
  occurredOn: string;
  needsReview: boolean;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Turn a validated extraction into something ready to save.
 * Receipts are expenses; the type is fixed rather than guessed.
 */
export function toTransactionDraft(
  extraction: ReceiptExtraction,
  {
    learnings = [],
    usdRate = null,
    today = new Date(),
  }: { learnings?: Learning[]; usdRate?: number | null; today?: Date } = {},
): ReceiptDraft | null {
  if (extraction.currency === 'USD' && !usdRate) return null;

  const category = guessCategory(categorizationText(extraction), 'expense', learnings);

  return {
    amount: extraction.total,
    currency: extraction.currency,
    fxRate: extraction.currency === 'USD' ? usdRate! : 1,
    type: 'expense',
    category,
    description: extraction.merchant ?? 'Ticket',
    occurredOn: extraction.date ?? toISODate(today),
    needsReview: extraction.confidence < REVIEW_THRESHOLD,
  };
}
