/**
 * Turning a card descriptor into something comparable to what a person typed.
 *
 * A statement line says `MERPAGO*CARREFOUR 004631`; the user wrote
 * `carrefour`. Everything the processor bolted on — its own brand, the
 * operation number, the country leg, the top-level domain — is noise for
 * matching, and stripping it is what makes the description score usable as
 * the heaviest of the three signals.
 *
 * `fold` is reused from the categories dictionary so accents behave the same
 * way here as they do everywhere else in the app.
 */
import { fold } from '../categories.ts';

/**
 * Payment processors and gateways that prefix the real merchant. Stripped
 * only from the front, and only while something else is left behind:
 * "Mercado Pago" as an actual expense must survive as `mercado pago`.
 */
export const PROCESSOR_PREFIXES = new Set([
  'merpago', 'mercadopago', 'mercpago', 'mp', 'meli', 'mercadolibre',
  'payu', 'dlocal', 'dl', 'ebanx', 'stripe', 'sq', 'sqsp', 'square',
  'paypal', 'pp', 'pagofacil', 'rapipago', 'todopago', 'mobbex', 'nps',
  'decidir', 'prisma', 'fisv', 'wpy', 'uala', 'modo', 'pdd', 'pay',
  'ar', 'arg', 'bra', 'mex', 'usa',
]);

/**
 * Filler at the end of a descriptor: legal forms, TLDs and the transaction
 * word processors append. Removed from the tail so `UBER *TRIP` and `UBER BV`
 * both land on `uber`.
 */
export const TRAILING_NOISE = new Set([
  'com', 'net', 'org', 'www', 'http', 'https', 'ar', 'arg', 'bv', 'sa',
  'srl', 'sas', 'sl', 'inc', 'llc', 'ltd', 'ltda', 'co', 'cia',
  'trip', 'trips', 'ride', 'bill', 'billing', 'payment',
  'online', 'web', 'app',
]);

// `pago`, `compra` and `debito` are deliberately *not* here: "Mercado Pago"
// is a merchant a user genuinely types, and stripping the second word turns
// it into "mercado", which then matches nothing.

/** Long mixed letter+digit blobs are operation references, never merchants. */
function isReference(token: string): boolean {
  if (/^\d+$/.test(token)) return true;
  return token.length >= 5 && /\d/.test(token) && /[a-z]/.test(token);
}

/**
 * The comparable tokens of a descriptor: folded, split on anything that is
 * not a letter or a digit, with processor prefixes, references and trailing
 * filler removed.
 *
 * Never returns an empty list when the input had any word at all — a
 * descriptor that is *only* noise (`PAYU*AR*`) keeps its last token rather
 * than collapsing to nothing and scoring 0 against everything.
 */
export function descriptionTokens(raw: string): string[] {
  const all = fold(raw)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (all.length === 0) return [];

  let tokens = all.filter((t) => !isReference(t));
  if (tokens.length === 0) tokens = all.slice(0, 1);

  // Front: drop gateway brands while a merchant remains behind them.
  let start = 0;
  while (start < tokens.length - 1 && PROCESSOR_PREFIXES.has(tokens[start])) start++;

  // Tail: drop filler while a word remains in front of it.
  let end = tokens.length;
  while (end - 1 > start && TRAILING_NOISE.has(tokens[end - 1])) end--;

  const kept = tokens.slice(start, end);
  return kept.length > 0 ? kept : tokens.slice(0, 1);
}

/** `descriptionTokens` joined back into one comparable string. */
export function normalizeDescription(raw: string): string {
  return descriptionTokens(raw).join(' ');
}

/**
 * The single token that best identifies the merchant — the first surviving
 * one. Used to group a statement's repeated merchants and to seed the
 * category guess when a movement becomes a new expense.
 */
export function merchantKey(raw: string): string {
  return descriptionTokens(raw)[0] ?? '';
}

/** Title-cased merchant name for display: `UBER *TRIP 45821` → `Uber`. */
export function merchantLabel(raw: string): string {
  const tokens = descriptionTokens(raw).slice(0, 3);
  if (tokens.length === 0) return raw.trim();
  return tokens.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
}
