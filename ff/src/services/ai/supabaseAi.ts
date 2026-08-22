import { FunctionsHttpError } from '@supabase/supabase-js';
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
  'no_api_key',
  'rate_limited',
  'ai_failed',
  'unavailable',
];

function errorFromBody(body: Record<string, unknown>): AiError | null {
  if (typeof body.error !== 'string') return null;
  const code = ERROR_CODES.find((c) => c === body.error) ?? 'unknown';
  return new AiError(code, body.error);
}

/**
 * Edge functions signal failure with a non-2xx status and a JSON body, so
 * supabase-js routes them through `error` (a `FunctionsHttpError`) instead of
 * `data`. Its `context` is the raw `Response` — read that to recover the real
 * code rather than collapsing every HTTP error into a generic one.
 *
 * Anything that isn't a `FunctionsHttpError` never got a response at all
 * (`FunctionsFetchError` for a failed fetch, `FunctionsRelayError` for the
 * Supabase relay itself) — that's a connectivity problem, not a "Supabase
 * isn't configured" problem, regardless of what the browser's error message
 * happens to say (Safari's is just "Load failed", which matches nothing).
 */
async function unwrap(data: unknown, error: unknown): Promise<Record<string, unknown>> {
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const fromBody = errorFromBody(await error.context.clone().json());
        if (fromBody) throw fromBody;
      } catch (e) {
        if (e instanceof AiError) throw e;
        // body wasn't JSON (or had no `error` field) — fall through below.
      }
      throw new AiError('unknown', error.message);
    }
    throw new AiError('offline', error instanceof Error ? error.message : String(error));
  }
  const body = (data ?? {}) as Record<string, unknown>;
  const fromBody = errorFromBody(body);
  if (fromBody) throw fromBody;
  return body;
}

export const supabaseAi: AiProvider = {
  async getReport(month, options) {
    if (isDemoMode()) throw new AiError('unavailable', 'demo mode');

    const { data, error } = await supabase.functions.invoke('ai-insights', {
      body: { month, force: options?.force === true },
    });
    const body = await unwrap(data, error);

    const result = body as unknown as AiReportResult;
    if (!result?.report) throw new AiError('unknown', 'missing report');
    return result;
  },

  async ask(month, question, history) {
    if (isDemoMode()) throw new AiError('unavailable', 'demo mode');

    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { month, question, history: history satisfies ChatTurn[] },
    });
    const body = await unwrap(data, error);

    const answer = (body as { answer?: unknown }).answer;
    if (typeof answer !== 'string' || !answer) throw new AiError('ai_failed', 'empty answer');
    return answer;
  },
};
