import {
  CATEGORY_KEYWORDS,
  FALLBACK_CATEGORY,
  categoriesFor,
  fold,
  type TxType,
} from './categories.ts';

export type Currency = 'ARS' | 'USD';

export interface Learning {
  keyword: string;
  category: string;
}

export interface ParseContext {
  type: TxType;
  /** Learned keyword→category pairs for THIS user. Highest priority. */
  learnings?: Learning[];
  /** ARS per USD. Required to accept a `usd` entry. */
  usdRate?: number | null;
  /** Injectable for deterministic tests. */
  today?: Date;
}

export interface ParsedTransaction {
  /** Amount as the user typed it, in `currency`. */
  amount: number;
  currency: Currency;
  /** ARS per unit of `currency`. 1 for ARS. */
  fxRate: number;
  type: TxType;
  category: string;
  description: string;
  date: string;
  rawInput: string;
  /** The arithmetic expression, when the user typed one. */
  calculation?: string;
}

const SAFE_EXPRESSION = /^[\d.+\-*/()]+$/;
const LEADING_EXPRESSION = /^[\d.+\-*/()\s×xX]+/;

/**
 * Evaluate a simple arithmetic expression.
 *
 * The original app used `new Function()` here (H-7). This is a small recursive
 * descent parser instead: same grammar, no code execution.
 *
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := '-'? (number | '(' expr ')')
 */
export function evaluateExpression(input: string): number | null {
  const src = input.replace(/\s+/g, '').replace(/[×xX]/g, '*');
  if (!/[+\-*/()]/.test(src)) return null;
  if (!SAFE_EXPRESSION.test(src)) return null;

  let pos = 0;

  const peek = () => src[pos];

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++];
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++];
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    if (peek() === '-') {
      pos++;
      const value = parseFactor();
      return value === null ? null : -value;
    }
    if (peek() === '(') {
      pos++;
      const value = parseExpr();
      if (value === null || src[pos] !== ')') return null;
      pos++;
      return value;
    }
    const start = pos;
    while (pos < src.length && /[\d.]/.test(src[pos])) pos++;
    if (pos === start) return null;
    const value = Number(src.slice(start, pos));
    return Number.isFinite(value) ? value : null;
  }

  const result = parseExpr();
  if (result === null || pos !== src.length) return null;
  return Number.isFinite(result) ? result : null;
}

/**
 * Normalize a number written with either ES or EN separators.
 * "1.234,56" → 1234.56 · "1,234.56" → 1234.56 · "1.234" → 1234
 */
export function normalizeNumber(raw: string): number {
  let s = raw;

  if (s.includes('.') && s.includes(',')) {
    // Whichever separator comes last is the decimal one.
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
    // "1.234" is a thousands separator; "12.34" is a decimal.
    if (parts.length > 1 && parts[parts.length - 1].length === 3 && parts[0].length <= 3) {
      s = s.replace(/\./g, '');
    }
  }

  return Number.parseFloat(s);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Word-anchored match with an optional plural suffix, so "coffee" matches
 * "coffees" but "pan" does not match "pantalon".
 *
 * Both sides are diacritic-folded, so the keyword "cafe" matches "café".
 */
export function matchesKeyword(text: string, keyword: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(fold(keyword))}(e?s)?($|[^\\p{L}\\p{N}])`, 'u')
    .test(fold(text));
}

export function guessCategory(
  text: string,
  type: TxType,
  learnings: Learning[] = [],
): string {
  const haystack = fold(text);

  const learned = learnings.find((l) => haystack.includes(fold(l.keyword)));
  if (learned) return learned.category;

  let best = FALLBACK_CATEGORY[type];
  let bestScore = 0;

  for (const category of categoriesFor(type)) {
    const score = (CATEGORY_KEYWORDS[category] ?? [])
      .reduce((n, kw) => (matchesKeyword(haystack, kw) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }

  return best;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const AMOUNT_PATTERNS = [
  /\$\s*([\d,.]+)/,
  /([\d,.]+)\s*\$/,
  /^([\d,.]+)\s+/,
  /\s+([\d,.]+)$/,
  /([\d,.]+)/,
];

/**
 * Turn a free-text entry into a transaction draft.
 * Returns `null` when no usable amount could be found.
 */
export function parseEntry(
  input: string,
  { type, learnings = [], usdRate = null, today = new Date() }: ParseContext,
): ParsedTransaction | null {
  const rawInput = input;
  const isUsd = /\busd\b|u\$s/i.test(input);
  const text = input.replace(/\busd\b|u\$s/gi, '').trim();

  // The original silently converted USD→ARS and stored a bare number, losing
  // the original figure and the rate used (H-3). We keep all three.
  const currency: Currency = isUsd ? 'USD' : 'ARS';
  const fxRate = isUsd ? (usdRate ?? 0) : 1;
  if (isUsd && !usdRate) return null;

  const base = {
    currency,
    fxRate,
    type,
    date: toISODate(today),
    rawInput,
  };

  // Branch A — the entry starts with an arithmetic expression.
  const leading = text.match(LEADING_EXPRESSION);
  if (leading) {
    const expression = leading[0];
    const amount = evaluateExpression(expression);
    if (amount !== null && amount > 0) {
      const description = text.slice(expression.length).trim();
      return {
        ...base,
        amount,
        calculation: expression.trim(),
        description: description || fallbackDescription(type, learnings, ''),
        category: guessCategory(description, type, learnings),
      };
    }
  }

  // Branch B — pull the first number that matches any known shape.
  let matched: string | null = null;
  for (const pattern of AMOUNT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      matched = m[1];
      break;
    }
  }
  if (matched === null) return null;

  const amount = normalizeNumber(matched);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const description = text
    .replace(/\$\s*[\d,.]+/g, '')
    .replace(/[\d,.]+\s*\$/g, '')
    .replace(/^[\d,.]+\s+/, '')
    .replace(/\s+[\d,.]+$/, '')
    .trim();

  const category = guessCategory(description || text, type, learnings);

  return {
    ...base,
    amount,
    category,
    description: description || category.replace(/_/g, ' '),
  };
}

function fallbackDescription(type: TxType, learnings: Learning[], text: string): string {
  return guessCategory(text, type, learnings).replace(/_/g, ' ');
}
