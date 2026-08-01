import { useCallback } from 'react';
import { toast } from 'sonner';
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions.ts';
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

  return {
    create,
    remove,
    save,
    usdRate: usdRate ?? null,
    creating: createTx.isPending,
    saving: updateTx.isPending,
  };
}
