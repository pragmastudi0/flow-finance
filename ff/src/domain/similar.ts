import { fold } from './categories.ts';
import type { Transaction } from '../types/models.ts';

/**
 * Finding the transactions that belong in the same category as one the user
 * just recategorized.
 *
 * The match is deliberately literal — shared words, nothing fuzzy. The word
 * that produced each match is returned along with it so the sheet can show
 * *why* a row is there, and every row is unticked with one tap. That makes a
 * false positive cost a tap instead of an explanation, which is worth more here
 * than a cleverer score.
 */

/**
 * Words too common to say anything about a category. Kept short on purpose:
 * anything longer starts throwing away real signal ("pan", "luz", "gas" are
 * three letters and all mean something here).
 */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'por',
  'para', 'con', 'sin', 'en', 'al', 'lo', 'mi', 'mis', 'su', 'sus', 'que',
  'the', 'of', 'for', 'with', 'and', 'to', 'my', 'in', 'on', 'at', 'from',
]);

const MIN_TOKEN_LENGTH = 3;

/**
 * The words of a text worth matching on: folded, without numbers, one-and
 * two-letter fragments, or stopwords. Order is preserved and duplicates drop.
 */
export function keyTokens(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of fold(text).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_TOKEN_LENGTH) continue;
    if (/^\d+$/.test(raw)) continue;
    if (STOPWORDS.has(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

/** Everything a transaction can be matched on: what it says now, and as typed. */
function transactionTokens(tx: Transaction): string[] {
  return keyTokens(`${tx.description} ${tx.rawInput ?? ''}`);
}

export interface SimilarMatch {
  transaction: Transaction;
  /** The words shared with the recategorized transaction. Never empty. */
  sharedTokens: string[];
}

/**
 * Transactions that look like `target` and are not already in `category`.
 *
 * Only the same side (expense or income) is considered: an income named
 * "café" has nothing to do with an expense category, and moving it there would
 * corrupt the totals.
 */
export function findSimilarTransactions(
  target: Transaction,
  all: readonly Transaction[],
  category: string,
): SimilarMatch[] {
  const wanted = new Set(transactionTokens(target));
  if (wanted.size === 0) return [];

  const destination = fold(category.trim());

  return all
    .filter((tx) => tx.id !== target.id)
    .filter((tx) => tx.type === target.type)
    .filter((tx) => fold(tx.category.trim()) !== destination)
    .map((transaction) => ({
      transaction,
      sharedTokens: transactionTokens(transaction).filter((t) => wanted.has(t)),
    }))
    .filter((match) => match.sharedTokens.length > 0)
    .sort(
      (a, b) =>
        b.sharedTokens.length - a.sharedTokens.length ||
        b.transaction.occurredOn.localeCompare(a.transaction.occurredOn),
    );
}

/**
 * The word to offer as a rule for future entries: the one shared by the most
 * matches, falling back to the target's own first word when it stands alone.
 */
export function suggestKeyword(
  target: Transaction,
  matches: readonly SimilarMatch[],
): string | null {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const token of match.sharedTokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [token, count] of counts) {
    // Ties go to the longer word: "cafe con leche" says more than "leche".
    if (count > bestCount || (count === bestCount && best !== null && token.length > best.length)) {
      best = token;
      bestCount = count;
    }
  }

  return best ?? transactionTokens(target)[0] ?? null;
}
