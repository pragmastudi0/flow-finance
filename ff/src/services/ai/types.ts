/**
 * The shape of an AI report on the client.
 *
 * Mirrors `supabase/functions/_shared/report.ts`, which is the validating
 * copy. The duplication is deliberate: edge functions run on Deno and can't
 * import from the Vite tree. Change one, change the other.
 */

export type FinancialHealth = 'excellent' | 'good' | 'fair' | 'poor';

export interface CategoryInsight {
  category: string;
  amount: number;
  note: string;
}

export interface SavingsOpportunity {
  title: string;
  detail: string;
  estimatedMonthlySaving: number | null;
}

export interface SuspiciousExpense {
  description: string;
  reason: string;
}

export interface MonthComparison {
  direction: 'up' | 'down' | 'flat';
  changePct: number;
  note: string;
}

export interface Projection {
  projectedExpenses: number | null;
  projectedBalance: number | null;
  note: string;
}

export interface AiReport {
  summary: string;
  score: number;
  health: FinancialHealth;
  topCategories: CategoryInsight[];
  monthComparison: MonthComparison;
  keyChanges: string[];
  savingsOpportunities: SavingsOpportunity[];
  suspiciousExpenses: SuspiciousExpense[];
  recommendations: string[];
  projection: Projection;
  priorityActions: string[];
  /** What the model could not assess from the available data. */
  missingData: string[];
}

export interface AiReportResult {
  report: AiReport;
  /** ISO timestamp of when the report was produced. */
  generatedAt: string;
  /** True when served from the cache rather than freshly generated. */
  cached: boolean;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Every failure the UI needs to tell apart. */
export type AiErrorCode =
  | 'unauthorized'
  | 'no_data'
  | 'rate_limited'
  | 'ai_failed'
  | 'offline'
  | 'unavailable'
  | 'unknown';

export class AiError extends Error {
  readonly code: AiErrorCode;

  constructor(code: AiErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AiError';
    this.code = code;
  }
}
