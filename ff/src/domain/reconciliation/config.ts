/**
 * Every knob the reconciliation engine turns, in one place.
 *
 * The weights and tolerances below are the whole tuning surface: nothing
 * downstream hardcodes a threshold. Callers that want a different profile
 * (a stricter card, a bank that posts three days late) pass a partial
 * override to `resolveConfig` rather than editing this file.
 */

export interface DateTier {
  /** Inclusive upper bound, in absolute days of difference. */
  maxDays: number;
  score: number;
}

export interface AmountTier {
  /** Inclusive upper bound of |a-b| / max(a,b). */
  maxPct: number;
  score: number;
}

export interface ReconciliationConfig {
  /** Component weights. Must sum to 1. */
  weights: {
    description: number;
    date: number;
    amount: number;
  };

  /**
   * Date scoring ladder. A credit card posts a purchase one to three days
   * after it happens, so an exact date is the exception, not the rule.
   */
  dateTiers: DateTier[];

  /**
   * Amount scoring ladder, on the *relative* difference. Card amounts drift
   * from what the user wrote down (tips, rounding, the FX rate applied on
   * posting day), which is why 15 % apart still scores 80 rather than 0.
   */
  amountTiers: AmountTier[];

  /** Absolute difference, in currency units, always treated as identical. */
  amountAbsoluteTolerance: number;

  /** Score at or above which a pair is a strong recommendation. */
  highConfidence: number;
  /** Score at or above which a pair is worth showing for review. */
  reviewThreshold: number;

  /**
   * The second route to a suggestion: a pair whose amounts and dates line up
   * so tightly that the numbers are evidence on their own.
   *
   * This is what lets `nafta $40.000 13/08` reach `Est servicio alaminos
   * $40.000 13/08`. Their descriptions share nothing, so the description-led
   * route scores it 50 and the candidate gate drops it before that — the
   * engine had no way to propose it at all.
   */
  anchors: {
    enabled: boolean;
    maxDayDistance: number;
    maxAmountPct: number;
    /** Ceiling: a numeric coincidence never reaches high confidence alone. */
    maxScore: number;
  };

  /** Candidate generation gates — cheap filters run before any scoring. */
  candidates: {
    maxDayDistance: number;
    maxAmountPct: number;
    minDescriptionScore: number;
    /** Hard cap on pairs scored, so a big statement can't blow up. */
    maxPairs: number;
  };

  /**
   * When the deterministic engine is allowed to spend a model call: only in
   * the review band, and only when the descriptions are what is uncertain.
   * A pair the rules already settle never reaches the model.
   */
  ai: {
    enabled: boolean;
    minScore: number;
    maxScore: number;
    /** Above this description score the text is clear enough on its own. */
    maxDescriptionScore: number;
    /** Cap on pairs sent in one request. */
    maxPairs: number;
    /** How much the model's confidence moves the deterministic score. */
    weight: number;
    /** Confidence at which a "not a match" verdict demotes the pair. */
    rejectConfidence: number;
  };
}

export const DEFAULT_RECONCILIATION_CONFIG: ReconciliationConfig = {
  weights: { description: 0.5, date: 0.25, amount: 0.25 },

  dateTiers: [
    { maxDays: 0, score: 100 },
    { maxDays: 1, score: 90 },
    { maxDays: 2, score: 78 },
    { maxDays: 3, score: 62 },
    { maxDays: 4, score: 50 },
    { maxDays: 5, score: 38 },
  ],

  amountTiers: [
    { maxPct: 0.001, score: 100 },
    { maxPct: 0.02, score: 95 },
    { maxPct: 0.05, score: 90 },
    { maxPct: 0.1, score: 85 },
    { maxPct: 0.2, score: 80 },
    { maxPct: 0.35, score: 60 },
    { maxPct: 0.5, score: 35 },
  ],
  amountAbsoluteTolerance: 1,

  highConfidence: 90,
  reviewThreshold: 70,

  anchors: {
    enabled: true,
    maxDayDistance: 1,
    maxAmountPct: 0.01,
    maxScore: 89,
  },

  candidates: {
    maxDayDistance: 5,
    maxAmountPct: 0.5,
    minDescriptionScore: 25,
    maxPairs: 20_000,
  },

  ai: {
    enabled: true,
    minScore: 70,
    maxScore: 90,
    maxDescriptionScore: 85,
    maxPairs: 12,
    weight: 0.3,
    rejectConfidence: 0.7,
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Defaults with `overrides` merged one level into each section. */
export function resolveConfig(
  overrides?: DeepPartial<ReconciliationConfig>,
): ReconciliationConfig {
  const base = DEFAULT_RECONCILIATION_CONFIG;
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    weights: { ...base.weights, ...overrides.weights },
    anchors: { ...base.anchors, ...overrides.anchors },
    candidates: { ...base.candidates, ...overrides.candidates },
    ai: { ...base.ai, ...overrides.ai },
    dateTiers: overrides.dateTiers ?? base.dateTiers,
    amountTiers: overrides.amountTiers ?? base.amountTiers,
  } as ReconciliationConfig;
}
