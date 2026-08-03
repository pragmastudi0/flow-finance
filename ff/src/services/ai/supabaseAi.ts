import { supabase, isDemoMode } from '@/lib/supabase.ts';
import type { AiProvider } from './provider.ts';
import { AiError, type AiErrorCode, type AiReportResult, type ChatTurn } from './types.ts';

/**
 * Talks to the `ai-insights` / `ai-chat` edge functions.
 *
 * The model key lives there as a Deno secret and is never shipped to the
 * browser — Vite inlines every `VITE_*` value into the public bundle, so a
 * client-side key would be a published key.
 */

const ERROR_CODES: AiErrorCode[] = [
  'unauthorized',
  'no_data',
  'rate_limited',
  'ai_failed',
  'unavailable',
];

/** Edge functions signal failure in the body, so a 200 can still be an error. */
function assertOk(data: unknown, error: unknown): asserts data is Record<string, unknown> {
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AiError(/fetch|network/i.test(message) ? 'offline' : 'unavailable', message);
  }
  const body = (data ?? {}) as Record<string, unknown>;
  if (typeof body.error === 'string') {
    const code = ERROR_CODES.find((c) => c === body.error) ?? 'unknown';
    throw new AiError(code, body.error);
  }
}

export const supabaseAi: AiProvider = {
  async getReport(month, options) {
    if (isDemoMode()) throw new AiError('unavailable', 'demo mode');

    const { data, error } = await supabase.functions.invoke('ai-insights', {
      body: { month, force: options?.force === true },
    });
    assertOk(data, error);

    const result = data as unknown as AiReportResult;
    if (!result?.report) throw new AiError('unknown', 'missing report');
    return result;
  },

  async ask(month, question, history) {
    if (isDemoMode()) throw new AiError('unavailable', 'demo mode');

    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { month, question, history: history satisfies ChatTurn[] },
    });
    assertOk(data, error);

    const answer = (data as { answer?: unknown }).answer;
    if (typeof answer !== 'string' || !answer) throw new AiError('ai_failed', 'empty answer');
    return answer;
  },
};
