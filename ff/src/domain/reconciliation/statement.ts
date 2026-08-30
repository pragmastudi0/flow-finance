/**
 * Credit-card statement parser.
 *
 * Written against the real file the app is used with: an Argentine Visa
 * summary whose text layer is selectable, so nothing here needs OCR or a
 * vision model. The format decides the rules — none of this was guessed:
 *
 *  - Sections. `Pago anterior y devoluciones`, `Movimientos de …`,
 *    `Impuestos, intereses y percepciones`, then `Términos y condiciones`,
 *    after which nothing is a movement.
 *  - The date is printed once per day and omitted on the rows that follow it,
 *    so it has to be carried forward.
 *  - A long merchant descriptor wraps onto its own lines, with the voucher
 *    number and the amount landing on the last one. Those fragments are
 *    buffered and joined rather than dropped.
 *  - Page headers (`Fecha Descripción Cuota …`), the footer
 *    (`Copia fiel de carácter informativo N de 6`), `Subtotal`, `Total a
 *    pagar`, `Mínimo a pagar` and the balance lines carry amounts and are
 *    *not* movements. They are recognised and skipped, and the subtotals are
 *    kept to check the extraction against.
 *
 * The input is plain text. Getting that text out of the PDF is
 * `src/lib/pdfText.ts`'s job, which is what keeps this file testable without
 * a PDF engine.
 */
import { normalizeNumber, type Currency } from '../parser.ts';
import { fold } from '../categories.ts';
import { movementFingerprint } from './fingerprint.ts';
import type { BankMovement, MovementKind } from './types.ts';

type Section = 'header' | 'payments' | 'movements' | 'charges' | 'end';

export interface UnreadLine {
  line: string;
  reason: 'no_date' | 'no_description' | 'orphan_text';
}

export interface StatementTotals {
  ARS: number | null;
  USD: number | null;
}

export interface ParsedStatement {
  cardLast4: string | null;
  /** `yyyy-MM-dd`, from "Cierre actual". Null when the header is unfamiliar. */
  closingDate: string | null;
  /** `yyyy-MM-dd`, from "Vencimiento actual". */
  dueDate: string | null;
  movements: BankMovement[];
  /** Lines inside a movement section that could not be read. Never silent. */
  needsReview: UnreadLine[];
  /** What the statement itself declares, to check the extraction against. */
  declaredSubtotal: StatementTotals;
  declaredTotal: StatementTotals;
  stats: {
    lines: number;
    movements: number;
    validDates: number;
    validAmounts: number;
    needsReview: number;
  };
}

/** `-U$S 14,47`, `$ 1.234,56`, `-$ 1.016.621,50` — anchored to end of line. */
const TRAILING_AMOUNT = /(-)?\s*(U\$S|US\$|USD|\$)\s*(-)?\s*(\d[\d.,]*)\s*$/;
const ANY_AMOUNT = /(-)?\s*(U\$S|US\$|USD|\$)\s*(-)?\s*(\d[\d.,]*)/g;
const LEADING_DATE = /^(\d{2})\/(\d{2})\/(\d{2})\b\s*/;
/** The issuer prints six digits; 4–8 keeps a reformat from breaking it. */
const TRAILING_VOUCHER = /\s(\d{4,8})$/;
const TRAILING_INSTALLMENT = /\s(\d{1,2})\s+de\s+(\d{1,2})$/;
/** Longest a wrapped merchant descriptor gets before it is really prose. */
const PROSE_LENGTH = 60;

/** Header rows, footers, balances and totals: they carry amounts, and none is a movement. */
const SKIP_PREFIXES = [
  'fecha descripcion',
  'copia fiel de caracter informativo',
  'subtotal',
  'total a pagar',
  'total consumido',
  'minimo a pagar',
  'saldo anterior',
  'saldo del resumen',
  'su pago en',
  'tarjetas incluidas',
  'terminada en',
  'visa credito terminada en',
  'visa debito terminada en',
  'proximas cuotas',
  'cuotas a vencer',
  'periodo de consumos',
  'limites',
  'tasas',
  '*si el monto',
  'si el monto del saldo',
];

const SECTION_MARKERS: Array<{ prefix: string; section: Section }> = [
  { prefix: 'pago anterior y devoluciones', section: 'payments' },
  { prefix: 'movimientos', section: 'movements' },
  { prefix: 'impuestos, intereses y percepciones', section: 'charges' },
  { prefix: 'terminos y condiciones', section: 'end' },
];

/** `DD/MM/YY` → `yyyy-MM-dd`. Null when the parts are not a real day. */
export function toIsoDate(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = 2000 + Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || d < 1 || d > 31 || m < 1 || m > 12) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

interface AmountMatch {
  amount: number;
  currency: Currency;
  negative: boolean;
  /** The text before the amount. */
  rest: string;
}

function readTrailingAmount(line: string): AmountMatch | null {
  const match = line.match(TRAILING_AMOUNT);
  if (!match) return null;
  const [full, signBefore, symbol, signAfter, digits] = match;
  const value = normalizeNumber(digits);
  if (!Number.isFinite(value)) return null;
  return {
    amount: Math.abs(value),
    currency: symbol === '$' ? 'ARS' : 'USD',
    negative: Boolean(signBefore || signAfter),
    rest: line.slice(0, line.length - full.length),
  };
}

/** Both columns of a totals row, so the extraction can be checked against it. */
function readTotals(line: string): StatementTotals {
  const totals: StatementTotals = { ARS: null, USD: null };
  ANY_AMOUNT.lastIndex = 0;
  for (const match of line.matchAll(ANY_AMOUNT)) {
    const value = normalizeNumber(match[4]);
    if (!Number.isFinite(value)) continue;
    const signed = match[1] || match[3] ? -value : value;
    if (match[2] === '$') totals.ARS ??= signed;
    else totals.USD ??= signed;
  }
  return totals;
}

/** Trailing currency symbols and separators the totals row leaves behind. */
function cleanDescription(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\s$·|,-]+$/u, '')
    .replace(/^[\s$·|,-]+/u, '')
    .trim();
}

const TAX_RE = /impuesto|iibb|iva|percep|ganancias|sellos|db\.?\s?rg|rg \d/;
const INTEREST_RE = /interes|punitorio|financiacion/;
const FEE_RE = /comi|comision|mantenimiento|cargo|seguro/;
const CASH_RE = /adelanto|efectivo|cash/;

function classify(
  section: Section,
  description: string,
  negative: boolean,
  hasInstallments: boolean,
): MovementKind {
  const text = fold(description);

  if (section === 'payments') return negative ? 'payment' : 'adjustment';

  if (section === 'charges') {
    if (TAX_RE.test(text)) return 'tax';
    if (INTEREST_RE.test(text)) return 'interest';
    if (FEE_RE.test(text)) return 'fee';
    return 'fee';
  }

  if (negative) return 'refund';
  if (CASH_RE.test(text)) return 'cash_advance';
  if (hasInstallments) return 'installment';
  return 'purchase';
}

/**
 * Read a statement's text into normalized movements.
 *
 * Deterministic and side-effect free: the same text always produces the same
 * movements, with the same fingerprints, which is what makes re-importing
 * safe.
 */
export function parseStatementText(text: string): ParsedStatement {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, ' ').trim())
    .filter(Boolean);

  const collapsed = fold(lines.join(' '));
  const cardLast4 = collapsed.match(/terminada en\s+(\d{4})/)?.[1] ?? null;
  const closing = collapsed.match(/cierre\s+actual\s+(\d{2})\/(\d{2})\/(\d{2})/);
  const due = collapsed.match(/vencimiento\s+actual\s+(\d{2})\/(\d{2})\/(\d{2})/);

  let section: Section = 'header';
  let currentDate: string | null = null;
  let buffer: string[] = [];

  const movements: BankMovement[] = [];
  const needsReview: UnreadLine[] = [];
  let declaredSubtotal: StatementTotals = { ARS: null, USD: null };
  let declaredTotal: StatementTotals = { ARS: null, USD: null };

  /** Unconsumed fragments are reported, never dropped. */
  const flushBuffer = () => {
    for (const line of buffer) needsReview.push({ line, reason: 'orphan_text' });
    buffer = [];
  };

  for (const line of lines) {
    const folded = fold(line);

    const marker = SECTION_MARKERS.find((m) => folded.startsWith(m.prefix));
    if (marker) {
      if (section === 'movements' || section === 'charges' || section === 'payments') flushBuffer();
      buffer = [];
      section = marker.section;
      currentDate = null;
      continue;
    }

    if (section === 'end') continue;

    // A date on its own line, or leading a wrapped descriptor, sets the day
    // every following row inherits until the next one appears.
    let rest = line;
    const dateMatch = rest.match(LEADING_DATE);
    if (dateMatch) {
      const iso = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
      if (iso) currentDate = iso;
      rest = rest.slice(dateMatch[0].length);
    }

    // Balance and total rows carry a date *and* an amount and still are not
    // movements ("10/08/26 Saldo anterior $ 1.016.621,50"), so the skip list
    // is checked against the line with its date removed as well.
    const foldedRest = fold(rest);
    if (SKIP_PREFIXES.some((p) => folded.startsWith(p) || foldedRest.startsWith(p))) {
      if (foldedRest.startsWith('subtotal')) declaredSubtotal = readTotals(line);
      if (foldedRest.startsWith('total a pagar')) declaredTotal = readTotals(line);
      buffer = [];
      continue;
    }

    if (section === 'header') continue;

    const amount = readTrailingAmount(rest);
    if (!amount) {
      // No amount: this is a wrapped piece of the next movement's descriptor.
      const fragment = rest.trim();
      // Merchant descriptors are short. Anything sentence-length is the wrap
      // of a footnote or a legal paragraph, not part of the next movement.
      if (fragment && fragment.length <= PROSE_LENGTH && fragment.split(' ').length <= 8) {
        buffer.push(fragment);
        if (buffer.length > 3) needsReview.push({ line: buffer.shift()!, reason: 'orphan_text' });
      }
      continue;
    }

    // A zero row is a placeholder in this format, not a movement.
    if (amount.amount === 0) {
      buffer = [];
      continue;
    }

    // The voucher number sits at the end of the *movement*, which on a
    // wrapped row is a different physical line from the merchant name — so
    // the fragments are joined first and only then read from the right.
    let body = [...buffer, amount.rest].join(' ').replace(/\s+/g, ' ').trim();
    buffer = [];

    let sourceReference: string | null = null;
    let installmentCurrent: number | null = null;
    let installmentTotal: number | null = null;

    if (section === 'movements') {
      const voucher = body.match(TRAILING_VOUCHER);
      if (voucher) {
        sourceReference = voucher[1];
        body = body.slice(0, body.length - voucher[0].length);
      }
      const installment = body.match(TRAILING_INSTALLMENT);
      if (installment) {
        installmentCurrent = Number(installment[1]);
        installmentTotal = Number(installment[2]);
        body = body.slice(0, body.length - installment[0].length);
      }
    }

    const description = cleanDescription(body);

    if (!description) {
      needsReview.push({ line, reason: 'no_description' });
      continue;
    }
    if (!currentDate) {
      needsReview.push({ line, reason: 'no_date' });
      continue;
    }

    const direction = amount.negative ? 'credit' : 'debit';
    const kind = classify(section, description, amount.negative, installmentTotal !== null);
    const fingerprint = movementFingerprint({
      occurredOn: currentDate,
      description,
      amount: amount.amount,
      currency: amount.currency,
      direction,
      sourceReference,
      cardLast4,
      installmentCurrent,
    });

    movements.push({
      // Unique within this parse even if two rows are byte-identical; the
      // fingerprint stays the cross-import identity.
      id: `${fingerprint}-${movements.length}`,
      occurredOn: currentDate,
      description,
      amount: amount.amount,
      currency: amount.currency,
      direction,
      kind,
      sourceReference,
      installmentCurrent,
      installmentTotal,
      cardLast4,
      fingerprint,
      rawLine: line,
      status: 'unmatched',
      matchedTransactionId: null,
    });
  }

  flushBuffer();

  return {
    cardLast4,
    closingDate: closing ? toIsoDate(closing[1], closing[2], closing[3]) : null,
    dueDate: due ? toIsoDate(due[1], due[2], due[3]) : null,
    movements,
    needsReview,
    declaredSubtotal,
    declaredTotal,
    stats: {
      lines: lines.length,
      movements: movements.length,
      validDates: movements.filter((m) => Boolean(m.occurredOn)).length,
      validAmounts: movements.filter((m) => m.amount > 0).length,
      needsReview: needsReview.length,
    },
  };
}

/**
 * Cross-check against the `Subtotal` the statement prints for itself.
 *
 * A silent mismatch is the failure mode that matters here — a parser that
 * quietly drops three rows still looks like it worked. This is what the
 * preview screen shows before anything is written.
 */
export function checkAgainstSubtotal(statement: ParsedStatement): {
  currency: Currency;
  declared: number;
  extracted: number;
  matches: boolean;
} | null {
  const declared = statement.declaredSubtotal.ARS;
  if (declared === null) return null;

  const extracted = statement.movements
    .filter((m) => m.currency === 'ARS' && (m.kind === 'purchase' || m.kind === 'installment'))
    .reduce((sum, m) => sum + (m.direction === 'credit' ? -m.amount : m.amount), 0);

  return {
    currency: 'ARS',
    declared,
    extracted: Number(extracted.toFixed(2)),
    matches: Math.abs(declared - extracted) < 1,
  };
}
