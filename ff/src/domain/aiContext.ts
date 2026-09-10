/**
 * The free-text context a user writes about their own situation ("vendo
 * tecnología, tengo muchos gastos de flete", "no tengo sueldo fijo").
 *
 * It travels in `user_metadata.aiContext` and ends up in the prompt of the
 * report and the chat, so the model reads the numbers the way the user's
 * activity actually works.
 *
 * Mirrored by hand in `supabase/functions/_shared/context.ts`: edge functions
 * run on Deno and can't import from the Vite tree.
 */

/** Long enough for a real description, short enough to stay a small prompt. */
export const AI_CONTEXT_MAX = 800;

export function sanitizeAiContext(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, AI_CONTEXT_MAX);
}
