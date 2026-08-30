/**
 * Candidate generation, global assignment and classification.
 *
 * The engine never asks "does this movement look like that expense?" in
 * isolation. Three Ubers in the same week would each answer yes to the same
 * charge, so pairs are scored, ranked, and then assigned greedily with both
 * sides locked once used. That single rule is what keeps a statement line
 * from being spent twice.
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

interface ScoredPair {
  movementIndex: number;
  expenseIndex: number;
  suggestion: MatchSuggestion;
  dayDistance: number;
  amountDifference: number;
}

/**
 * Pairs worth scoring: same currency, inside the date window, inside the
 * amount window, and with descriptions that are at least faintly related.
 * Everything else is discarded before the weighted score is ever computed.
 */
function generateCandidates(
  movements: BankMovement[],
  expenses: AppExpense[],
  config: ReconciliationConfig,
): ScoredPair[] {
  const pairs: ScoredPair[] = [];
  const { candidates } = config;

  for (let m = 0; m < movements.length; m++) {
    const movement = movements[m];
    for (let e = 0; e < expenses.length; e++) {
      const expense = expenses[e];
      if (movement.currency !== expense.currency) continue;

      const distance = dayDistance(movement.occurredOn, expense.occurredOn);
      if (Number.isNaN(distance) || distance > candidates.maxDayDistance) continue;

      const delta = amountDelta(movement.amount, expense.amount);
      if (
        delta.absolute > config.amountAbsoluteTolerance &&
        delta.percent > candidates.maxAmountPct
      ) continue;

      if (descriptionScore(movement.description, expense.description) < candidates.minDescriptionScore) {
        continue;
      }

      const score = scorePair(movement, expense, config);
      if (score.total < config.reviewThreshold) continue;

      pairs.push({
        movementIndex: m,
        expenseIndex: e,
        dayDistance: distance,
        amountDifference: delta.absolute,
        suggestion: {
          movement,
          expense,
          score,
          confidence: score.total >= config.highConfidence ? 'high' : 'review',
          source: 'deterministic',
          difference: Number((movement.amount - expense.amount).toFixed(2)),
        },
      });

      if (pairs.length >= candidates.maxPairs) return pairs;
    }
  }

  return pairs;
}

/**
 * Best-first assignment.
 *
 * Sorted by score, then by the tie-breakers that actually distinguish two
 * charges at the same merchant: the closer date first, then the closer
 * amount. Once a movement or an expense is taken it is locked out of every
 * remaining pair.
 */
function assign(pairs: ScoredPair[]): ScoredPair[] {
  const ranked = [...pairs].sort(
    (a, b) =>
      b.suggestion.score.total - a.suggestion.score.total ||
      a.dayDistance - b.dayDistance ||
      a.amountDifference - b.amountDifference ||
      a.movementIndex - b.movementIndex ||
      a.expenseIndex - b.expenseIndex,
  );

  const takenMovements = new Set<number>();
  const takenExpenses = new Set<number>();
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

  const openExpenses = expenses.filter((e) => !e.reconciledMovementId);

  const assigned = assign(generateCandidates([...movements], [...openExpenses], config));

  const matches: MatchSuggestion[] = [];
  const review: MatchSuggestion[] = [];
  const usedMovements = new Set<string>();
  const usedExpenses = new Set<string>();

  for (const pair of assigned) {
    usedMovements.add(pair.suggestion.movement.id);
    usedExpenses.add(pair.suggestion.expense.id);
    (pair.suggestion.confidence === 'high' ? matches : review).push(pair.suggestion);
  }

  const unmatchedMovements = movements.filter((m) => !usedMovements.has(m.id));
  const unmatchedExpenses = openExpenses.filter((e) => !usedExpenses.has(e.id));

  return {
    matches,
    review,
    unmatchedMovements,
    unmatchedExpenses,
    informational,
    summary: {
      movements: allMovements.length,
      expenses: openExpenses.length,
      matched: matches.length,
      review: review.length,
      unmatchedMovements: unmatchedMovements.length,
      unmatchedExpenses: unmatchedExpenses.length,
    },
  };
}
