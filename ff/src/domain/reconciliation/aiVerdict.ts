/**
 * The AI layer: which pairs deserve a model call, and what to do with what
 * comes back.
 *
 * The engine does not ask the model to reconcile the statement. It asks one
 * narrow question about the handful of pairs the rules could not settle —
 * "are these two descriptors the same merchant?" — and treats the answer as
 * an adjustment to a score it already has. A pair the rules resolve cleanly
 * never costs a call.
 *
 * The validator here is the client-side mirror of
 * `supabase/functions/reconcile-match/index.ts`. Edge functions run on Deno and
 * cannot import from the Vite tree; change one, change the other.
 */
import type { ReconciliationConfig } from './config.ts';
import { DEFAULT_RECONCILIATION_CONFIG } from './config.ts';
import type { MatchSuggestion } from './types.ts';

export interface AiMatchQuestion {
  id: string;
  movementDescription: string;
  expenseDescription: string;
  movementAmount: number;
  expenseAmount: number;
  movementDate: string;
  expenseDate: string;
}

export interface AiMatchVerdict {
  id: string;
  match: boolean;
  /** 0–1. */
  confidence: number;
  reason: string;
  merchant: string | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Validate one verdict object off the wire. Anything malformed is dropped
 * rather than coerced: a verdict is only allowed to move a score if it
 * arrived in the shape that was asked for.
 */
export function parseVerdict(raw: unknown): AiMatchVerdict | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;

  const id = typeof data.id === 'string' ? data.id.trim() : '';
  if (!id) return null;
  if (typeof data.match !== 'boolean') return null;

  const confidence =
    typeof data.confidence === 'number' && Number.isFinite(data.confidence)
      ? clamp01(data.confidence)
      : null;
  if (confidence === null) return null;

  const merchantRaw = typeof data.merchant === 'string' ? data.merchant.trim() : '';

  return {
    id,
    match: data.match,
    confidence,
    reason: typeof data.reason === 'string' ? data.reason.trim().slice(0, 300) : '',
    merchant: merchantRaw ? merchantRaw.slice(0, 80) : null,
  };
}

/** Validate the whole `{ verdicts: [...] }` envelope. */
export function parseVerdicts(raw: unknown): AiMatchVerdict[] {
  const list =
    Array.isArray(raw) ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { verdicts?: unknown }).verdicts)
      ? (raw as { verdicts: unknown[] }).verdicts
      : [];

  const seen = new Set<string>();
  const out: AiMatchVerdict[] = [];
  for (const item of list) {
    const verdict = parseVerdict(item);
    if (!verdict || seen.has(verdict.id)) continue;
    seen.add(verdict.id);
    out.push(verdict);
  }
  return out;
}

/** Identifier for a pair, stable across the request/response round trip. */
export const pairId = (suggestion: MatchSuggestion) =>
  `${suggestion.movement.id}:${suggestion.expense.id}`;

/**
 * The pairs worth a model call: in the review band, and uncertain *because
 * of the text*. A pair scoring 76 purely because the amounts are far apart
 * learns nothing from a language model, so it is left alone.
 */
export function selectForAi(
  suggestions: readonly MatchSuggestion[],
  config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG,
): AiMatchQuestion[] {
  if (!config.ai.enabled) return [];

  return suggestions
    .filter(
      (s) =>
        s.score.total >= config.ai.minScore &&
        s.score.total < config.ai.maxScore &&
        s.score.description < config.ai.maxDescriptionScore,
    )
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, config.ai.maxPairs)
    .map((s) => ({
      id: pairId(s),
      // The raw descriptor is what the model is good at reading; the
      // normalized one is what the rules already tried and could not settle.
      movementDescription: s.movement.description,
      expenseDescription: s.expense.description,
      movementAmount: s.movement.amount,
      expenseAmount: s.expense.amount,
      movementDate: s.movement.occurredOn,
      expenseDate: s.expense.occurredOn,
    }));
}

/**
 * Fold verdicts back into the suggestions.
 *
 * A confirmation nudges the score toward the model's confidence; a confident
 * rejection pushes the pair below the review threshold so it stops being
 * offered. The model never decides on its own — it moves a number the rules
 * produced, and the user still confirms.
 */
export function applyVerdicts(
  suggestions: readonly MatchSuggestion[],
  verdicts: readonly AiMatchVerdict[],
  config: ReconciliationConfig = DEFAULT_RECONCILIATION_CONFIG,
): { suggestions: MatchSuggestion[]; discarded: MatchSuggestion[] } {
  const byId = new Map(verdicts.map((v) => [v.id, v]));
  const kept: MatchSuggestion[] = [];
  const discarded: MatchSuggestion[] = [];

  for (const suggestion of suggestions) {
    const verdict = byId.get(pairId(suggestion));
    if (!verdict) {
      kept.push(suggestion);
      continue;
    }

    if (!verdict.match && verdict.confidence >= config.ai.rejectConfidence) {
      discarded.push({ ...suggestion, source: 'ai-rejected', reason: verdict.reason });
      continue;
    }

    const { weight } = config.ai;
    const blended = verdict.match
      ? suggestion.score.total * (1 - weight) + verdict.confidence * 100 * weight
      : suggestion.score.total * (1 - weight) + (1 - verdict.confidence) * 100 * weight;
    const total = Math.max(0, Math.min(100, Math.round(blended)));

    if (total < config.reviewThreshold) {
      discarded.push({ ...suggestion, source: 'ai-rejected', reason: verdict.reason });
      continue;
    }

    kept.push({
      ...suggestion,
      score: { ...suggestion.score, total },
      confidence: total >= config.highConfidence ? 'high' : 'review',
      source: verdict.match ? 'ai-confirmed' : 'deterministic',
      reason: verdict.reason || suggestion.reason,
    });
  }

  return { suggestions: kept, discarded };
}
