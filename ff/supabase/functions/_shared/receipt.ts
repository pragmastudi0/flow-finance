type Currency = 'ARS' | 'USD';

interface LineItem {
  description: string;
  quantity: number | null;
  totalPrice: number | null;
}

interface DocumentExtraction {
  merchant: string | null;
  total: number;
  currency: Currency;
  date: string | null;
  items: LineItem[];
  confidence: number;
}

export type { Currency, LineItem, DocumentExtraction };

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeNumber(raw: string): number {
  let s = raw;
  if (s.includes('.') && s.includes(',')) {
    s = s.lastIndexOf('.') < s.lastIndexOf(',')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length === 2
      ? s.replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    s = parts.length === 2 && parts[1].length === 2
      ? s
      : s.replace(/\./g, '');
  }
  return parseFloat(s) || 0;
}

const MAX_AGE_DAYS = 400;

export const DOCUMENT_PROMPT = `Analizás fotos de tickets y facturas de compra argentinos.

Devolvé UN objeto JSON y nada más. Sin explicaciones, sin markdown, sin \`\`\`.

Esquema:
{
  "merchant": string|null,
  "total": number,
  "currency": "ARS"|"USD",
  "date": string|null,
  "items": [{ "description": string, "quantity": number|null, "totalPrice": number|null }],
  "confidence": number
}

Reglas:
- El total es el importe final pagado. Si el documento muestra subtotal e IVA, devolvé el TOTAL.
- Los tickets argentinos usan punto como separador de miles y coma decimal ("1.234,56"). Convertí a número: 1234.56
- Si no podés leer el total con confianza, igual devolví tu mejor estimación y bajá "confidence".
- Si la imagen no es un ticket ni factura válido, devolvé "total": 0 y "confidence": 0.
- "items" puede ir vacío. No inventes renglones.
- No inventes el comercio ni la fecha: si no se leen, devolvé null.`;

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
  ) return null;
  const ageDays = (today.getTime() - parsed.getTime()) / 86_400_000;
  if (ageDays < -1 || ageDays > MAX_AGE_DAYS) return null;
  return `${y}-${m}-${d}`;
}

function coerceItems(value: unknown): LineItem[] {
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
        totalPrice: coerceAmount(item.totalPrice),
      };
    })
    .filter((i): i is LineItem => i !== null);
}

export function parseDocumentResponse(
  raw: string,
  { today = new Date() }: { today?: Date } = {},
): DocumentExtraction | null {
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
  } as DocumentExtraction;
}
