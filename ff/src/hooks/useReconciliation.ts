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
 *
 * There are two ways in and they share everything after persistence:
 * `importStatement` reads a new PDF, `openImport` reopens one already stored.
 * That is what makes leaving the screen safe — the statement is in the
 * database, not in this component's state.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { extractPdfText, fileHash, PdfTextError } from '@/lib/pdfText.ts';
import {
  checkAgainstSubtotal,
  parseStatementText,
  type ParsedStatement,
  type UnreadLine,
} from '@/domain/reconciliation/statement.ts';
import { reconcile } from '@/domain/reconciliation/matching.ts';
import { applyVerdicts, selectForAi } from '@/domain/reconciliation/aiVerdict.ts';
import { DEFAULT_RECONCILIATION_CONFIG } from '@/domain/reconciliation/config.ts';
import type { AppExpense, BankMovement, MatchSuggestion } from '@/domain/reconciliation/types.ts';
import { ai } from '@/services/ai/index.ts';
import { AiError } from '@/services/ai/types.ts';
import {
  confirmMatch,
  createExpenseFromMovement,
  findImport,
  ignoreMovement,
  loadConfirmedMatches,
  loadExpensesInRange,
  loadMovements,
  loadReconciledTransactionIds,
  rejectMatch,
  saveStatementImport,
  undoMatch,
  updateExpenseAmount,
  type ConfirmedMatch,
} from '@/services/reconciliation.ts';
import type { Transaction } from '@/types/models.ts';

export type ImportStage =
  | 'idle'
  | 'reading'
  | 'parsing'
  | 'saving'
  | 'matching'
  | 'ai'
  | 'done'
  | 'error';

export type ImportErrorCode =
  | 'encrypted'
  | 'scanned'
  | 'unreadable'
  | 'no_movements'
  | 'auth'
  | 'unknown';

/**
 * Everything the screen needs to say about the statement itself.
 *
 * Deliberately smaller than `ParsedStatement`: it is persisted into the
 * import's `stats` column, so reopening a statement rebuilds it from the
 * database rather than from a PDF the user would have to upload again.
 */
export interface StatementMeta {
  cardLast4: string | null;
  closingDate: string | null;
  needsReview: UnreadLine[];
  subtotalCheck: ReturnType<typeof checkAgainstSubtotal>;
}

export interface ReconciliationView {
  importId: string;
  fileName: string;
  meta: StatementMeta;
  movementCount: number;
  /** True when this exact file had already been imported. */
  alreadyImported: boolean;
  /** Movements the fingerprint index recognised from an earlier statement. */
  duplicates: number;
  matches: MatchSuggestion[];
  review: MatchSuggestion[];
  /** Proposed on the amount and the date alone. */
  recommended: MatchSuggestion[];
  unmatchedMovements: BankMovement[];
  unmatchedExpenses: AppExpense[];
  informational: BankMovement[];
  /** Already accepted, on this import, in any past session. */
  confirmed: ConfirmedMatch[];
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
    paymentMethod: tx.paymentMethod,
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

const metaFromStatement = (statement: ParsedStatement): StatementMeta => ({
  cardLast4: statement.cardLast4,
  closingDate: statement.closingDate,
  needsReview: statement.needsReview,
  subtotalCheck: checkAgainstSubtotal(statement),
});

/** The same meta, read back off the import row's `stats`. */
function metaFromStats(
  cardLast4: string | null,
  closingDate: string | null,
  stats: Record<string, unknown>,
): StatementMeta {
  return {
    cardLast4,
    closingDate,
    needsReview: Array.isArray(stats.needsReview) ? (stats.needsReview as UnreadLine[]) : [],
    subtotalCheck: (stats.subtotalCheck ?? null) as StatementMeta['subtotalCheck'],
  };
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

  /**
   * Everything after persistence, shared by both entry points.
   *
   * `useAi` is off when re-running after an undo: the verdicts have not
   * changed and a second call would spend the user's daily quota to learn
   * nothing.
   */
  const runMatching = useCallback(
    async (
      base: Pick<ReconciliationView, 'importId' | 'fileName' | 'meta' | 'alreadyImported' | 'duplicates'>,
      movements: BankMovement[],
      { useAi = true }: { useAi?: boolean } = {},
    ) => {
      setStage('matching');

      // Anything the user already answered is out of the running: a confirmed
      // movement keeps its expense, a rejected one is not offered again.
      const open = movements.filter((m) => m.status === 'unmatched' || m.status === 'suggested');
      const reconciledIds = await loadReconciledTransactionIds();

      const window = dateWindow(movements);
      const transactions = window ? await loadExpensesInRange(window.from, window.to) : [];
      const expenses = transactions.map((t) => toAppExpense(t, reconciledIds));

      const result = reconcile(open, expenses);
      const confirmed = await loadConfirmedMatches(base.importId);

      // Only the pairs the rules could not settle — the review band's
      // text-ambiguous ones, and every amount anchor — ever reach the model.
      const questions = useAi ? selectForAi([...result.review, ...result.recommended]) : [];
      let { matches, review, recommended } = result;
      let aiSkipped: string | null = questions.length === 0 ? 'no_ambiguity' : null;
      let aiConsulted = 0;

      if (questions.length > 0) {
        setStage('ai');
        try {
          const verdicts = await ai.judgeMatches(questions);
          aiConsulted = verdicts.length;
          const applied = applyVerdicts(
            [...result.matches, ...result.review, ...result.recommended],
            verdicts,
          );
          // A confirmed anchor becomes `ai-confirmed`, which is what moves it
          // out of Recommended and into the group it belongs in.
          matches = applied.suggestions.filter(
            (s) => s.source !== 'amount-anchor' && s.confidence === 'high',
          );
          review = applied.suggestions.filter(
            (s) => s.source !== 'amount-anchor' && s.confidence === 'review',
          );
          recommended = applied.suggestions.filter((s) => s.source === 'amount-anchor');
        } catch (e) {
          // The deterministic result is complete on its own; a model that is
          // unavailable must not cost the user their import.
          aiSkipped = e instanceof AiError ? e.code : 'unknown';
        }
      }

      setView({
        ...base,
        movementCount: movements.length,
        matches,
        review,
        recommended,
        unmatchedMovements: result.unmatchedMovements,
        unmatchedExpenses: result.unmatchedExpenses,
        informational: result.informational,
        confirmed,
        aiSkipped,
        aiConsulted,
      });
      setStage('done');
    },
    [],
  );

  const importStatement = useCallback(
    async (file: File) => {
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

        await runMatching(
          {
            importId: outcome.importId,
            fileName: file.name,
            meta: metaFromStatement(statement),
            alreadyImported: outcome.alreadyImported,
            duplicates: outcome.duplicates,
          },
          outcome.movements,
        );
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
    },
    [runMatching],
  );

  /**
   * Reopen a statement already in the database.
   *
   * No PDF, no parsing, no inserts — the movements and their statuses are
   * already there, so this is the matching pass over what is still open.
   */
  const openImport = useCallback(
    async (importId: string, options: { useAi?: boolean } = {}) => {
      setError(null);
      try {
        setStage('matching');
        const [record, movements] = await Promise.all([
          findImport(importId),
          loadMovements(importId),
        ]);
        if (!record) {
          setStage('error');
          setError('unknown');
          return;
        }
        await runMatching(
          {
            importId,
            fileName: record.fileName,
            meta: metaFromStats(record.cardLast4, record.closingDate, record.stats),
            alreadyImported: false,
            duplicates: 0,
          },
          movements,
          options,
        );
      } catch (e) {
        console.error('reopening the import failed', e);
        setStage('error');
        setError('unknown');
      }
    },
    [runMatching],
  );

  /** Drop a suggestion from the screen once the user has answered it. */
  const settle = useCallback((movementId: string) => {
    setView((current) =>
      current
        ? {
            ...current,
            matches: current.matches.filter((s) => s.movement.id !== movementId),
            review: current.review.filter((s) => s.movement.id !== movementId),
            recommended: current.recommended.filter((s) => s.movement.id !== movementId),
            unmatchedMovements: current.unmatchedMovements.filter((m) => m.id !== movementId),
          }
        : current,
    );
  }, []);

  /** Move an accepted pair into the Reconciled group without a round trip. */
  const recordConfirmed = useCallback((match: ConfirmedMatch) => {
    setView((current) =>
      current ? { ...current, confirmed: [match, ...current.confirmed] } : current,
    );
  }, []);

  const accept = useCallback(
    async (suggestion: MatchSuggestion, options?: { adoptCardAmount?: boolean }) => {
      await confirmMatch(
        suggestion.movement.id,
        suggestion.expense.id,
        suggestion.score,
        suggestion.reason,
        // Accepting is the user saying this expense was on the card, so an
        // expense with no method recorded gets one.
        { stampAsCard: !suggestion.expense.paymentMethod },
      );
      // Only on an explicit request: the reconciliation itself never rewrites
      // an amount the user entered.
      if (options?.adoptCardAmount) {
        await updateExpenseAmount(suggestion.expense.id, suggestion.movement.amount);
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });

      recordConfirmed({
        movement: { ...suggestion.movement, status: 'confirmed', matchedTransactionId: suggestion.expense.id },
        transaction: {
          id: suggestion.expense.id,
          type: 'expense',
          amount: options?.adoptCardAmount ? suggestion.movement.amount : suggestion.expense.amount,
          currency: suggestion.expense.currency,
          fxRate: 1,
          category: suggestion.expense.category,
          description: suggestion.expense.description,
          occurredOn: suggestion.expense.occurredOn,
          paymentMethod: suggestion.expense.paymentMethod ?? 'credit',
          rawInput: null,
          calculation: null,
          createdAt: '',
        },
        matchedAt: new Date().toISOString(),
        score: suggestion.score.total,
      });
      settle(suggestion.movement.id);
    },
    [queryClient, recordConfirmed, settle],
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
      // The new expense is reconciled on creation, so it belongs in the
      // Reconciled group straight away.
      recordConfirmed({
        movement: { ...movement, status: 'confirmed' },
        transaction: {
          id: '',
          type: 'expense',
          amount: input.amount,
          currency: input.currency as Transaction['currency'],
          fxRate: input.fxRate,
          category: input.category,
          description: input.description,
          occurredOn: input.occurredOn,
          paymentMethod: input.paymentMethod ?? 'credit',
          rawInput: input.rawInput ?? null,
          calculation: null,
          createdAt: '',
        },
        matchedAt: new Date().toISOString(),
        score: 100,
      });
    },
    [queryClient, recordConfirmed, settle],
  );

  /**
   * Take back a confirmation. The tray is rebuilt so the movement reappears
   * where it belongs, with the model left alone: its verdicts have not
   * changed and a second call would spend quota to learn nothing.
   */
  const undo = useCallback(
    async (match: ConfirmedMatch) => {
      await undoMatch(match.movement.id);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      const importId = view?.importId;
      if (importId) await openImport(importId, { useAi: false });
    },
    [openImport, queryClient, view?.importId],
  );

  return {
    stage,
    error,
    view,
    importStatement,
    openImport,
    reset,
    accept,
    decline,
    ignore,
    createExpense,
    undo,
  };
}
