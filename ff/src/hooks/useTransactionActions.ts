import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  useBulkUpdateCategory,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions.ts';
import {
  useDeleteLearning,
  useSaveLearning,
  type SavedLearning,
} from '@/hooks/useCategories.ts';
import { useLanguage } from '@/i18n/LanguageProvider.tsx';
import { useBlueRate } from '@/hooks/useExchangeRate.ts';
import type { Transaction } from '@/types/models.ts';
import type { ParsedTransaction } from '@/domain/parser.ts';

interface Options {
  /** Keeps a saved transaction on screen when it lands outside the shown month. */
  showMonthOf: (iso: string) => void;
}

/**
 * Create / delete / edit, with the toasts and the currency handling that go
 * with them. This was 130 lines of handler bodies inside Home.
 */
export function useTransactionActions({ showMonthOf }: Options) {
  const { t, language } = useLanguage();
  const es = language === 'es';
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();
  const updateTx = useUpdateTransaction();
  const bulkUpdate = useBulkUpdateCategory();
  const saveLearning = useSaveLearning();
  const deleteLearning = useDeleteLearning();
  const { data: usdRate } = useBlueRate();

  const create = useCallback(
    async (parsed: ParsedTransaction) => {
      if (createTx.isPending) return false;
      try {
        await createTx.mutateAsync({
          type: parsed.type,
          amount: parsed.amount,
          currency: parsed.currency,
          fxRate: parsed.fxRate,
          category: parsed.category,
          description: parsed.description,
          occurredOn: parsed.date,
          rawInput: parsed.rawInput,
          calculation: parsed.calculation ?? null,
        });
        showMonthOf(parsed.date);
        toast.success(
          es
            ? parsed.type === 'expense' ? 'Gasto guardado' : 'Ingreso guardado'
            : parsed.type === 'expense' ? 'Expense saved' : 'Income saved',
        );
        return true;
      } catch {
        toast.error(es ? 'Error al guardar' : 'Error saving');
        return false;
      }
    },
    [createTx, es, showMonthOf],
  );

  const remove = useCallback(
    (tx: Transaction) => {
      deleteTx.mutate(tx.id, {
        onSuccess: () =>
          // The delete is permanent and a long swipe fires easily, so an
          // accidental gesture must be recoverable.
          toast.success(es ? 'Movimiento eliminado' : 'Transaction deleted', {
            action: {
              label: t('undo'),
              onClick: () =>
                createTx.mutate({
                  type: tx.type,
                  amount: tx.amount,
                  currency: tx.currency,
                  fxRate: tx.fxRate,
                  category: tx.category,
                  description: tx.description,
                  occurredOn: tx.occurredOn,
                  rawInput: tx.rawInput,
                  calculation: tx.calculation,
                }),
            },
          }),
        onError: () => toast.error(es ? 'Error al eliminar' : 'Delete error'),
      });
    },
    [createTx, deleteTx, es, t],
  );

  const save = useCallback(
    async (original: Transaction, data: Partial<Transaction>) => {
      try {
        // Switching currency has to re-price the transaction, otherwise the ARS
        // totals keep using the old rate.
        let fxRate = original.fxRate;
        if (data.currency && data.currency !== original.currency) {
          if (data.currency === 'USD') {
            if (!usdRate) {
              toast.error(
                es
                  ? 'No pude obtener la cotización del dólar.'
                  : "Couldn't fetch the USD rate.",
              );
              return false;
            }
            fxRate = usdRate;
          } else {
            fxRate = 1;
          }
        }
        await updateTx.mutateAsync({ id: original.id, ...data, fxRate });
        if (data.occurredOn) showMonthOf(data.occurredOn);
        toast.success(es ? 'Cambios guardados' : 'Changes saved');
        return true;
      } catch {
        toast.error(es ? 'Error al guardar' : 'Error saving');
        return false;
      }
    },
    [es, showMonthOf, updateTx, usdRate],
  );

  /**
   * Put a batch of transactions in one category, and optionally teach the
   * parser the word that got them there.
   *
   * The rule is saved second and on its own: a keyword that fails to store is
   * worth a warning, not a rollback of a move that already succeeded.
   */
  const recategorize = useCallback(
    async (selected: Transaction[], category: string, keyword: string | null) => {
      if (selected.length === 0) return false;
      const type = selected[0].type;
      const previous = selected.map((tx) => ({ id: tx.id, category: tx.category }));

      try {
        await bulkUpdate.mutateAsync({ ids: selected.map((tx) => tx.id), category });
      } catch {
        toast.error(t('recategorizeFailed'));
        return false;
      }

      let learned: SavedLearning | null = null;
      if (keyword) {
        try {
          learned = await saveLearning.mutateAsync({ keyword, category, type });
        } catch {
          toast.error(t('ruleSaveFailed'));
        }
      }

      const undoAll = async () => {
        // One call per previous category — in practice one or two.
        const byCategory = new Map<string, string[]>();
        for (const p of previous) {
          byCategory.set(p.category, [...(byCategory.get(p.category) ?? []), p.id]);
        }
        try {
          for (const [previousCategory, ids] of byCategory) {
            await bulkUpdate.mutateAsync({ ids, category: previousCategory });
          }
          // Undo has to reach the rule too, or the next entry would silently
          // land in the category the user just walked back.
          if (learned) {
            if (learned.previousCategory === null) {
              await deleteLearning.mutateAsync(learned.id);
            } else {
              await saveLearning.mutateAsync({
                keyword: learned.keyword,
                category: learned.previousCategory,
                type,
              });
            }
          }
          toast.success(t('recategorizeUndone'));
        } catch {
          toast.error(t('recategorizeFailed'));
        }
      };

      toast.success(t('recategorized'), {
        action: { label: t('undo'), onClick: () => void undoAll() },
      });
      return true;
    },
    [bulkUpdate, deleteLearning, saveLearning, t],
  );

  return {
    create,
    remove,
    save,
    recategorize,
    usdRate: usdRate ?? null,
    creating: createTx.isPending,
    saving: updateTx.isPending,
    recategorizing: bulkUpdate.isPending || saveLearning.isPending,
  };
}
