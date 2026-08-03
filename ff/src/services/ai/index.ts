/**
 * All AI access in the app goes through here.
 *
 * Nothing outside this folder should know which model or vendor is in use —
 * swapping providers is a change to `ai` below (and, today, to the
 * `AI_PROVIDER` secret on the edge function).
 */
import { supabaseAi } from './supabaseAi.ts';
import type { AiProvider } from './provider.ts';

export const ai: AiProvider = supabaseAi;

export type { AiProvider } from './provider.ts';
export * from './types.ts';
