import type { AiMatchQuestion, AiMatchVerdict } from '@/domain/reconciliation/aiVerdict.ts';
import type { AiReportResult, ChatTurn } from './types.ts';

/**
 * The seam.
 *
 * Everything the app knows about AI is these three calls. Swapping Gemini for
 * OpenAI or Groq is a change behind this interface — today that switch is an
 * `AI_PROVIDER` secret on the edge function and no client change at all, but
 * a wholly different backend would just be another implementation here.
 */
export interface AiProvider {
  /**
   * The report for `month` (`yyyy-MM`). Returns the cached report unless
   * `force`, which is what the "generate new analysis" button sends.
   */
  getReport(month: string, options?: { force?: boolean }): Promise<AiReportResult>;

  /** One turn of conversation. `history` is supplied by the caller. */
  ask(month: string, question: string, history: ChatTurn[]): Promise<string>;

  /**
   * Settles the reconciliation pairs the deterministic engine could not.
   *
   * Called with a handful of ambiguous descriptor pairs, never with a whole
   * statement — the rules run first and only what they leave open gets here.
   * Returns one verdict per pair it could answer; pairs it skips keep their
   * deterministic score untouched.
   */
  judgeMatches(pairs: AiMatchQuestion[]): Promise<AiMatchVerdict[]>;
}
