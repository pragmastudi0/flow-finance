/**
 * Candidate generation, global assignment and classification.
 *
 * The engine never asks "does this movement look like that expense?" in
 * isolation. Three Ubers in the same week would each answer yes to the same
 * charge, so pairs are scored, ranked, and then assigned greedily with both
 * sides locked once used. That single rule is what keeps a statement line
 * from being spent twice.
 *
 * There are two routes to a candidate, and they are assigned in that order:
 *
 *  1. **Description-led.** The descriptors are related; the weighted score of
 *     all three signals decides.
 *  2. **Amount anchor.** The descriptors share nothing, but the amount and the
 *     date line up so tightly that the numbers are the evidence. This is the
 *     `nafta $40.000 13/08` ↔ `Est servicio alaminos $40.000 13/08` case: the
 *     description scores 0, so route 1 both gates it out and could never get
 *     it past the review threshold. An anchor is capped below high confidence
 *     and is a prime candidate for the model, which is what can actually tell
 *     you that a service station is where you buy fuel.
 */
import type { ReconciliationConfig } from './config.ts';
import { resolveConfig } from './config.ts';
import { amountDelta, dayDistance, descriptionScore, scorePair } from './scoring.ts';
import type {
  AppExpense,
  BankMovement,
  MatchSuggestion,
  ReconciliationResult,
} from './types.ts';

/**
 * Whether a statement line is something that could correspond to an expense
 * the user typed. Card payments and refunds move money the other way, and
 * matching them against expenses would be wrong in both directions.
 */
export function isReconcilable(movement: BankMovement): boolean {
  if (movement.direction !== 'debit') return false;
  return movement.kind !== 'payment' && movement.kind !== 'refund';
}

/**
 * Whether an expense could have been paid with the card this statement is for.
 *
 * Cash, a transfer and a debit card cannot appear on a credit summary, so
 * they are removed from the running entirely — which is the single biggest
 * source of wrong candidates once the user starts recording the method. An
 * expense with no method recorded stays eligible: every row that predates the
 * column has none, and excluding them would leave nothing to reconcile.
 */
export function payableByCard(expense: AppExpense): boolean {
  const method = expense.paymentMethod;
  if (!method) return true;
  return method === 'credit' || method === 'other';
}

interface ScoredPair {
  movementIndex: number;
  expenseIndex: number;
  suggestion: MatchSuggestion;
  dayDistance: number;
  amountDifference: number;
  /** The user said this one was on a card. Breaks ties in its favour. */
  onCard: boolean;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function buildPair(
  movementIndex: number,
  expenseIndex: number,
  expense: AppExpense,
  suggestion: MatchSuggestion,
  distance: number,
  amountDifference: number,
): ScoredPair {
  return {
    movementIndex,
    expenseIndex,
    suggestion,
    dayDistance: distance,
    amountDifference,
    onCard: expense.paymentMethod === 'credit',
  };
}

/**
 * Both routes, in one pass over the pairs.
 *
 * The cheap gates — currency, date window, amount window — run before any
 * scoring, and the description score is only computed for pairs that clear
 * them.
 */
function generateCandidates(
  movements: BankMovement[],
  expenses: AppExpense[],
  config: ReconciliationConfig,
): { described: ScoredPair[]; anchored: ScoredPair[] } {
  const described: ScoredPair[] = [];
  const anchored: ScoredPair[] = [];
  const { candidates, anchors } = config;

  for (let m = 0; m < movements.length; m++) {
    const movement = movements[m];
    for (let e = 0; e < expenses.length; e++) {
      const expense = expenses[e];
      if (movement.currency !== expense.currency) continue;

      const distance = dayDistance(movement.occurredOn, expense.occurredOn);
      if (Number.isNaN(distance) || distance > candidates.maxDayDistance) continue;

      const delta = amountDelta(movement.amount, expense.amount);
      const withinAbsolute = delta.absolute <= config.amountAbsoluteTolerance;
      if (!withinAbsolute && delta.percent > candidates.maxAmountPct) continue;

      const difference = Number((movement.amount - expense.amount).toFixed(2));
      const description = descriptionScore(movement.description, expense.description);

      if (description >= candidates.minDescriptionScore) {
        const score = scorePair(movement, expense, config);
        if (score.total >= config.reviewThreshold) {
          described.push(
            buildPair(m, e, expense, {
              movement,
              expense,
              score,
              confidence: score.total >= config.highConfidence ? 'high' : 'review',
              source: 'deterministic',
              difference,
            }, distance, delta.absolute),
          );
        }
      }

      // The anchor is evaluated even when the description already qualified:
      // the two-pass assignment below decides which one is offered, and a
      // description-led pair always wins its movement first.
      if (
        anchors.enabled &&
        distance <= anchors.maxDayDistance &&
        (withinAbsolute || delta.percent <= anchors.maxAmountPct)
      ) {
        const full = scorePair(movement, expense, config);
        // Renormalised over the two signals that actually carry information
        // here, then capped: a numeric coincidence is a recommendation, never
        // a conclusion.
        const total = clamp((anchors.maxScore * (full.date * 0.5 + full.amount * 0.5)) / 100);
        anchored.push(
          buildPair(m, e, expense, {
            movement,
            expense,
            score: { ...full, total },
            confidence: 'review',
            source: 'amount-anchor',
            difference,
          }, distance, delta.absolute),
        );
      }

      if (described.length + anchored.length >= candidates.maxPairs) {
        return { described, anchored };
      }
    }
  }

  return { described, anchored };
}

/**
 * Best-first assignment onto whatever is still free.
 *
 * Sorted by score, then by the tie-breakers that actually distinguish two
 * charges at the same merchant: an expense the user marked as paid by card,
 * then the closer date, then the closer amount. `takenMovements` and
 * `takenExpenses` are carried across calls, which is what makes the second
 * pass see only what the first one left behind.
 */
function assign(
  pairs: ScoredPair[],
  takenMovements: Set<number>,
  takenExpenses: Set<number>,
): ScoredPair[] {
  const ranked = [...pairs].sort(
    (a, b) =>
      b.suggestion.score.total - a.suggestion.score.total ||
      Number(b.onCard) - Number(a.onCard) ||
      a.dayDistance - b.dayDistance ||
      a.amountDifference - b.amountDifference ||
      a.movementIndex - b.movementIndex ||
      a.expenseIndex - b.expenseIndex,
  );

  const assigned: ScoredPair[] = [];
  for (const pair of ranked) {
    if (takenMovements.has(pair.movementIndex) || takenExpenses.has(pair.expenseIndex)) continue;
    takenMovements.add(pair.movementIndex);
    takenExpenses.add(pair.expenseIndex);
    assigned.push(pair);
  }

  return assigned;
}

export interface ReconcileOptions {
  config?: Parameters<typeof resolveConfig>[0];
}

/**
 * Reconcile one statement against the app's own expenses.
 *
 * Pure: no dates, no randomness, no I/O. Anything already confirmed on
 * either side is filtered out by the caller before it gets here, which is
 * what makes running this twice on the same import idempotent.
 */
export function reconcile(
  allMovements: readonly BankMovement[],
  expenses: readonly AppExpense[],
  options: ReconcileOptions = {},
): ReconciliationResult & { informational: BankMovement[] } {
  const config = resolveConfig(options.config);

  const movements = allMovements.filter(isReconcilable);
  const informational = allMovements.filter((m) => !isReconcilable(m));

  const openExpenses = expenses.filter((e) => !e.reconciledMovementId && payableByCard(e));

  const { described, anchored } = generateCandidates([...movements], [...openExpenses], config);

  // Two passes, in this order on purpose: an anchor scoring 89 must never take
  // a movement away from a description-led pair scoring 75. Shared merchants
  // beat shared arithmetic.
  const takenMovements = new Set<number>();
  const takenExpenses = new Set<number>();
  const assigned = [
    ...assign(described, takenMovements, takenExpenses),
    ...assign(anchored, takenMovements, takenExpenses),
  ];

  const matches: MatchSuggestion[] = [];
  const review: MatchSuggestion[] = [];
  const recommended: MatchSuggestion[] = [];
  const usedMovements = new Set<string>();
  const usedExpenses = new Set<string>();

  for (const pair of assigned) {
    usedMovements.add(pair.suggestion.movement.id);
    usedExpenses.add(pair.suggestion.expense.id);
    if (pair.suggestion.source === 'amount-anchor') recommended.push(pair.suggestion);
    else if (pair.suggestion.confidence === 'high') matches.push(pair.suggestion);
    else review.push(pair.suggestion);
  }

  const unmatchedMovements = movements.filter((m) => !usedMovements.has(m.id));
  const unmatchedExpenses = openExpenses.filter((e) => !usedExpenses.has(e.id));

  return {
    matches,
    review,
    recommended,
    unmatchedMovements,
    unmatchedExpenses,
    informational,
    summary: {
      movements: allMovements.length,
      expenses: openExpenses.length,
      matched: matches.length,
      review: review.length,
      recommended: recommended.length,
      unmatchedMovements: unmatchedMovements.length,
      unmatchedExpenses: unmatchedExpenses.length,
    },
  };
}
