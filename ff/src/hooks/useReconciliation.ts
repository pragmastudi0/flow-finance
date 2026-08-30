/**
 * The pipeline, wired end to end.
 *
 *   PDF → text → parse → persist → candidates → scoring → AI (only when the
 *   rules are stuck) → suggestions → the user's decision → persistence
 *
 * Each stage is a function this hook calls; none of them live here. What the
 * hook owns is the order, the progress the screen shows, and the failure
 * modes — in particular, that a model call which cannot happen (no key, over
 * quota, demo mode) degrades to the deterministic result instead of failing
 * the import.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { extractPdfText, fileHash, PdfTextError } from '@/lib/pdfText.ts';
import { parseStatementText, checkAgainstSubtotal, type ParsedStatement } from '@/domain/reconciliation/statement.ts';
import { reconcile } from '@/domain/reconciliation/matching.ts';
import { applyVerdicts, selectForAi } from '@/domain/reconciliation/aiVerdict.ts';
import { DEFAULT_RECONCILIATION_CONFIG } from '@/domain/reconciliation/config.ts';
import type { AppExpense, BankMovement, MatchSuggestion } from '@/domain/reconciliation/types.ts';
import { ai } from '@/services/ai/index.ts';
import { AiError } from '@/services/ai/types.ts';
import {
  confirmMatch,
  createExpenseFromMovement,
  loadExpensesInRange,
  loadReconciledTransactionIds,
  rejectMatch,
  ignoreMovement,
  saveStatementImport,
  updateExpenseAmount,
  type ImportOutcome,
} from '@/services/reconciliation.ts';
import type { Transaction } from '@/types/models.ts';

export type ImportStage = 'idle' | 'reading' | 'parsing' | 'saving' | 'matching' | 'ai' | 'done' | 'error';

export type ImportErrorCode =
  | 'encrypted'
  | 'scanned'
  | 'unreadable'
  | 'no_movements'
  | 'auth'
  | 'unknown';

export interface ReconciliationView {
  importId: string;
  fileName: string;
  statement: ParsedStatement;
  outcome: ImportOutcome;
  matches: MatchSuggestion[];
  review: MatchSuggestion[];
  unmatchedMovements: BankMovement[];
  unmatchedExpenses: AppExpense[];
  informational: BankMovement[];
  subtotalCheck: ReturnType<typeof checkAgainstSubtotal>;
  /** Why the model was not consulted, when it was not. Null when it was. */
  aiSkipped: string | null;
  aiConsulted: number;
}

/** `Transaction` → the comparison shape. Amounts stay in their own currency. */
function toAppExpense(tx: Transaction, reconciledIds: Set<string>): AppExpense {
  return {
    id: tx.id,
    occurredOn: tx.occurredOn,
    description: `${tx.description} ${tx.rawInput ?? ''}`.trim(),
    amount: tx.amount,
    currency: tx.currency,
    category: tx.category,
    reconciledMovementId: reconciledIds.has(tx.id) ? 'reconciled' : null,
  };
}

/** The statement's own span, widened by the date tolerance on both ends. */
function dateWindow(movements: BankMovement[]): { from: string; to: string } | null {
  const days = movements.map((m) => m.occurredOn).filter(Boolean).sort();
  if (days.length === 0) return null;
  const shift = (day: string, delta: number) => {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  };
  const padding = DEFAULT_RECONCILIATION_CONFIG.candidates.maxDayDistance;
  return { from: shift(days[0], -padding), to: shift(days[days.length - 1], padding) };
}

export function useReconciliation() {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ImportStage>('idle');
  const [error, setError] = useState<ImportErrorCode | null>(null);
  const [view, setView] = useState<ReconciliationView | null>(null);

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    setView(null);
  }, []);

  const importStatement = useCallback(async (file: File) => {
    setError(null);
    setView(null);

    try {
      setStage('reading');
      const [hash, text] = await Promise.all([fileHash(file), extractPdfText(file)]);

      setStage('parsing');
      const statement = parseStatementText(text);
      if (statement.movements.length === 0) {
        setStage('error');
        setError('no_movements');
        return;
      }

      setStage('saving');
      const outcome = await saveStatementImport(file.name, hash, statement);

      setStage('matching');
      // Anything the user already answered is out of the running: a confirmed
      // movement keeps its expense, a rejected one is not offered again.
      const open = outcome.movements.filter(
        (m) => m.status === 'unmatched' || m.status === 'suggested',
      );
      const reconciledIds = await loadReconciledTransactionIds();

      const window = dateWindow(outcome.movements);
      const transactions = window ? await loadExpensesInRange(window.from, window.to) : [];
      const expenses = transactions.map((t) => toAppExpense(t, reconciledIds));

      const result = reconcile(open, expenses);

      // Only the pairs the rules could not settle, and only because of their
      // text, ever reach the model.
      const questions = selectForAi(result.review);
      let matches = result.matches;
      let review = result.review;
      let aiSkipped: string | null = questions.length === 0 ? 'no_ambiguity' : null;
      let aiConsulted = 0;

      if (questions.length > 0) {
        setStage('ai');
        try {
          const verdicts = await ai.judgeMatches(questions);
          aiConsulted = verdicts.length;
          const applied = applyVerdicts([...result.matches, ...result.review], verdicts);
          matches = applied.suggestions.filter((s) => s.confidence === 'high');
          review = applied.suggestions.filter((s) => s.confidence === 'review');
        } catch (e) {
          // The deterministic result is complete on its own; a model that is
          // unavailable must not cost the user their import.
          aiSkipped = e instanceof AiError ? e.code : 'unknown';
        }
      }

      setView({
        importId: outcome.importId,
        fileName: file.name,
        statement,
        outcome,
        matches,
        review,
        unmatchedMovements: result.unmatchedMovements,
        unmatchedExpenses: result.unmatchedExpenses,
        informational: result.informational,
        subtotalCheck: checkAgainstSubtotal(statement),
        aiSkipped,
        aiConsulted,
      });
      setStage('done');
    } catch (e) {
      setStage('error');
      if (e instanceof PdfTextError) {
        setError(e.code === 'encrypted' ? 'encrypted' : e.code === 'no_text' ? 'scanned' : 'unreadable');
        return;
      }
      // Kept for diagnosis: the screen only ever shows the actionable message.
      console.error('reconciliation import failed', e);
      setError('unknown');
    }
  }, []);

  /** Drop a suggestion from the screen once the user has answered it. */
  const settle = useCallback((movementId: string) => {
    setView((current) =>
      current
        ? {
            ...current,
            matches: current.matches.filter((s) => s.movement.id !== movementId),
            review: current.review.filter((s) => s.movement.id !== movementId),
            unmatchedMovements: current.unmatchedMovements.filter((m) => m.id !== movementId),
          }
        : current,
    );
  }, []);

  const accept = useCallback(
    async (suggestion: MatchSuggestion, options?: { adoptCardAmount?: boolean }) => {
      await confirmMatch(
        suggestion.movement.id,
        suggestion.expense.id,
        suggestion.score,
        suggestion.reason,
      );
      // Only on an explicit request: the reconciliation itself never rewrites
      // an amount the user entered.
      if (options?.adoptCardAmount) {
        await updateExpenseAmount(suggestion.expense.id, suggestion.movement.amount);
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      }
      settle(suggestion.movement.id);
    },
    [queryClient, settle],
  );

  const decline = useCallback(
    async (suggestion: MatchSuggestion) => {
      await rejectMatch(suggestion.movement.id);
      settle(suggestion.movement.id);
    },
    [settle],
  );

  const ignore = useCallback(
    async (movement: BankMovement) => {
      await ignoreMovement(movement.id);
      settle(movement.id);
    },
    [settle],
  );

  const createExpense = useCallback(
    async (movement: BankMovement, input: Parameters<typeof createExpenseFromMovement>[1]) => {
      await createExpenseFromMovement(movement, input);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      settle(movement.id);
    },
    [queryClient, settle],
  );

  return { stage, error, view, importStatement, reset, accept, decline, ignore, createExpense };
}
