/**
 * The deterministic half of the engine.
 *
 * Three independent signals, each 0–100, combined by the weights in
 * `config.ts`. Keeping them separate is what lets the UI show *why* a pair
 * scored what it did, and what lets the AI layer be asked only about the one
 * signal that is actually uncertain.
 */
import { descriptionTokens, normalizeDescription } from './normalize.ts';
import type { ReconciliationConfig } from './config.ts';
import { DEFAULT_RECONCILIATION_CONFIG } from './config.ts';
import type { ScoreBreakdown } from './types.ts';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Sørensen–Dice over character bigrams — forgiving of typos and truncation. */
function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }

  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      counts.set(g, left - 1);
      shared++;
    }
  }

  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

/**
 * How alike two descriptions are, after normalization.
 *
 * Two views are taken and the kinder one wins:
 *  - tokens, weighted toward *coverage* (the shorter descriptor being fully
 *    contained in the longer one, which is the `uber` / `uber trip` case);
 *  - characters, which catches abbreviations and misspellings that share no
 *    whole token.
 */
export function descriptionScore(a: string, b: string): number {
  const left = descriptionTokens(a);
  const right = descriptionTokens(b);
  if (left.length === 0 || right.length === 0) return 0;

  const normalizedA = left.join(' ');
  const normalizedB = right.join(' ');
  if (normalizedA === normalizedB) return 100;

  const setA = new Set(left);
  const setB = new Set(right);
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;

  const dice = (2 * shared) / (setA.size + setB.size);
  const coverage = shared / Math.min(setA.size, setB.size);
  const tokenSimilarity = 0.6 * coverage + 0.4 * dice;

  // The character view is discounted: sharing letters says less than sharing
  // a whole word, and without the discount "carrefour" and "carrefur sa"
  // would outrank a genuine token hit.
  const characterSimilarity = 0.9 * bigramSimilarity(normalizedA, normalizedB);

  return clamp(100 * Math.max(tokenSimilarity, characterSimilarity));
}

/** Whole days between two `yyyy-MM-dd` dates. `NaN` when either is unusable. */
export function dayDistance(a: string, b: string): number {
  const left = Date.parse(`${a}T12:00:00Z`);
  const right = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(left) || Number.isNaN(right)) return NaN;
  return Math.round(Math.abs(left - right) / 86_400_000);
}

/**
 * Date closeness on the configured ladder.
 *
 * A card's posting date is not the purchase date, so an exact hit is a bonus
 * rather than a requirement — the ladder stays generous out to five days and
 * then stops dead, which is the point past which two same-merchant charges
 * are more likely to be two different purchases.
 */
export function dateScore(
  a: string,
  b: string,
  config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG,
): number {
  const distance = dayDistance(a, b);
  if (Number.isNaN(distance)) return 0;
  for (const tier of config.dateTiers) {
    if (distance <= tier.maxDays) return tier.score;
  }
  return 0;
}

/** Relative gap between two amounts, 0 when they are identical. */
export function amountDelta(a: number, b: number): { absolute: number; percent: number } {
  const absolute = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return { absolute, percent: scale === 0 ? 0 : absolute / scale };
}

/**
 * Amount closeness on the configured ladder.
 *
 * Deliberately tolerant: the card posts tips, surcharges and the day's FX
 * rate on top of what the user wrote down, so `$4.000` against `$4.752` has
 * to stay a candidate. The tolerance is paid for on the other side — a pair
 * this far apart can never reach high confidence on the amount alone, and
 * nothing is ever written without the user confirming.
 */
export function amountScore(
  a: number,
  b: number,
  config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG,
): number {
  const { absolute, percent } = amountDelta(a, b);
  if (absolute <= config.amountAbsoluteTolerance) return 100;
  for (const tier of config.amountTiers) {
    if (percent <= tier.maxPct) return tier.score;
  }
  return 0;
}

export interface ScoreInput {
  description: string;
  occurredOn: string;
  amount: number;
}

/** The weighted combination, plus each component that produced it. */
export function scorePair(
  movement: ScoreInput,
  expense: ScoreInput,
  config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG,
): ScoreBreakdown {
  const description = descriptionScore(movement.description, expense.description);
  const date = dateScore(movement.occurredOn, expense.occurredOn, config);
  const amount = amountScore(movement.amount, expense.amount, config);
  const { weights } = config;

  return {
    description,
    date,
    amount,
    total: clamp(
      description * weights.description + date * weights.date + amount * weights.amount,
    ),
  };
}

/** Normalized descriptions, exposed for the AI prompt and for debugging. */
export const normalizedPair = (a: string, b: string) => ({
  movement: normalizeDescription(a),
  expense: normalizeDescription(b),
});
