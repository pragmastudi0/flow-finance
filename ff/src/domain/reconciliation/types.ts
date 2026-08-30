/**
 * The vocabulary of the reconciliation module.
 *
 * `BankMovement` is the normalized shape every import source produces. The
 * PDF parser fills it today; a CSV or an eventual bank API would fill the
 * same one, which is what keeps the matching engine independent of where the
 * data came from.
 */
import type { Currency } from '../parser.ts';

/** What a statement line actually is. Not every amount is a purchase. */
export type MovementKind =
  | 'purchase'
  | 'installment'
  | 'payment'
  | 'refund'
  | 'interest'
  | 'tax'
  | 'fee'
  | 'cash_advance'
  | 'adjustment'
  | 'unknown';

export type MovementDirection = 'debit' | 'credit';

/** Lifecycle of a movement inside a reconciliation. Mirrors the DB enum. */
export type ReconciliationStatus = 'unmatched' | 'suggested' | 'confirmed' | 'rejected' | 'ignored';

export interface BankMovement {
  /** Stable within one parse; the DB id once persisted. */
  id: string;
  /** `yyyy-MM-dd`. */
  occurredOn: string;
  /** Exactly as printed on the statement. */
  description: string;
  /** Always positive; the sign lives in `direction`. */
  amount: number;
  currency: Currency;
  direction: MovementDirection;
  kind: MovementKind;
  /** Voucher / operation number printed by the issuer, when there is one. */
  sourceReference: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  /** Last four digits of the card the movement belongs to. */
  cardLast4: string | null;
  /** Deduplication key — see `fingerprint.ts`. */
  fingerprint: string;
  /** The statement line it came from, for the "needs review" affordance. */
  rawLine: string;
  status?: ReconciliationStatus;
  matchedTransactionId?: string | null;
}

/** The side of the comparison that lives in the app already. */
export interface AppExpense {
  id: string;
  occurredOn: string;
  description: string;
  /** Base-currency value, i.e. `amount * fxRate`. */
  amount: number;
  currency: Currency;
  category: string;
  /** Set when this expense is already tied to a movement. */
  reconciledMovementId?: string | null;
}

export interface ScoreBreakdown {
  description: number;
  date: number;
  amount: number;
  total: number;
}

export type MatchConfidence = 'high' | 'review';

/** Where a score came from, so the UI can say why it is showing a pair. */
export type MatchSource = 'deterministic' | 'ai-confirmed' | 'ai-rejected';

export interface MatchSuggestion {
  movement: BankMovement;
  expense: AppExpense;
  score: ScoreBreakdown;
  confidence: MatchConfidence;
  source: MatchSource;
  /** Movement amount minus expense amount. Positive: the card charged more. */
  difference: number;
  /** Human-readable justification, filled by the model when it was consulted. */
  reason?: string;
}

export interface ReconciliationResult {
  /** Score at or above the high-confidence threshold. */
  matches: MatchSuggestion[];
  /** Score in the review band. */
  review: MatchSuggestion[];
  /** Statement movements with no candidate — "found, not registered". */
  unmatchedMovements: BankMovement[];
  /** App expenses with no candidate — "registered, not on the statement". */
  unmatchedExpenses: AppExpense[];
  summary: {
    movements: number;
    expenses: number;
    matched: number;
    review: number;
    unmatchedMovements: number;
    unmatchedExpenses: number;
  };
}
