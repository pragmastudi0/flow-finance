import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

import { useLanguage } from '@/i18n/LanguageProvider';
import {
  useTransactions,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions';
import { useCategoryLearnings } from '@/hooks/useCategories';
import { useBlueRate } from '@/hooks/useExchangeRate';
import { useMonthFilter } from '@/hooks/useMonthFilter';
import { groupTransactions, parseDay } from '@/domain/grouping';
import { parseEntry, type ParsedTransaction } from '@/domain/parser';
import { analyzeDocument, confirmTransaction, DocumentError } from '@/lib/receipts';
import { isDemoMode } from '@/lib/supabase';
import type { AnalyzedDocument } from '@/lib/receipts';
import { baseAmount } from '@/types/models';
import type { Transaction } from '@/types/models';
import type { TxType } from '@/domain/categories';
import { PageShell } from '@/components/layout/PageShell';
import { MoneyHeader, type TxFilter } from '@/components/money/MoneyHeader';
import { TransactionList } from '@/components/money/TransactionList';
import { FloatingActionButton } from '@/components/money/FloatingActionButton';
import { BottomSheetAddExpense } from '@/components/money/BottomSheetAddExpense';
import { DocumentAnalysisSheet } from '@/components/analysis/DocumentAnalysisSheet';
import { EditTransactionSheet } from '@/components/transactions/EditTransactionSheet';

export default function Home() {
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const { data: transactions, isLoading } = useTransactions();
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();
  const updateTx = useUpdateTransaction();

  const [mode, setMode] = useState<TxType>('expense');
  const [filter, setFilter] = useState<TxFilter>('all');
  const { data: learnings } = useCategoryLearnings(mode);
  const { data: usdRate } = useBlueRate();
  const [pending, setPending] = useState<ParsedTransaction | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [extraction, setExtraction] = useState<AnalyzedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const month = useMonthFilter();

  const monthTransactions = useMemo(
    () => (transactions ?? []).filter(month.matches),
    [transactions, month],
  );

  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of monthTransactions) {
      // Always the base (ARS) value — USD entries carry a non-1 fxRate.
      if (tx.type === 'income') income += baseAmount(tx);
      else expense += baseAmount(tx);
    }
    return { income, expense };
  }, [monthTransactions]);

  const visible = useMemo(
    () => (filter === 'all' ? monthTransactions : monthTransactions.filter((tx) => tx.type === filter)),
    [monthTransactions, filter],
  );

  const groups = useMemo(
    () => groupTransactions(visible, { isCurrentMonth: month.isCurrentMonth, now: new Date() }),
    [visible, month.isCurrentMonth],
  );

  const hasAnyEver = !!transactions && transactions.length > 0;

  /** True when the text was understood; the sheet clears its field on that. */
  const handleSend = (text: string): boolean => {
    // Without `learnings` the per-user categories were ignored, and without
    // `usdRate` every USD entry was rejected outright.
    const parsed = parseEntry(text, {
      type: mode,
      learnings: learnings ?? [],
      usdRate: usdRate ?? null,
    });
    if (parsed) {
      setPending(parsed);
      return true;
    }
    const isUsd = /\busd\b|u\$s/i.test(text);
    if (isUsd && !usdRate) {
      toast.error(
        language === 'es'
          ? 'No pude obtener la cotización del dólar. Probá de nuevo en unos segundos.'
          : "Couldn't fetch the USD rate. Try again in a few seconds.",
      );
      return false;
    }
    toast.error(t('couldNotDetect'));
    return false;
  };

  const handleConfirmPending = async () => {
    if (!pending || createTx.isPending) return;
    try {
      await createTx.mutateAsync({
        type: pending.type,
        amount: pending.amount,
        currency: pending.currency,
        fxRate: pending.fxRate,
        category: pending.category,
        description: pending.description,
        occurredOn: pending.date,
        rawInput: pending.rawInput,
        calculation: pending.calculation ?? null,
      });
      setPending(null);
      setAddOpen(false);
      // A transaction saved while browsing another month would otherwise land
      // off-screen.
      month.showMonthOf(pending.date);
      toast.success(
        language === 'es'
          ? pending.type === 'expense' ? 'Gasto guardado' : 'Ingreso guardado'
          : pending.type === 'expense' ? 'Expense saved' : 'Income saved',
      );
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Error saving');
    }
  };

  const handleUpload = async (file: File) => {
    if (isDemoMode()) {
      toast.error(
        language === 'es'
          ? 'El análisis de comprobantes necesita Supabase configurado (no está disponible en modo demo).'
          : 'Receipt analysis requires Supabase to be configured (not available in demo mode).',
      );
      return;
    }
    try {
      setPreviewUrl(URL.createObjectURL(file));
      const result = await analyzeDocument(file);
      setExtraction(result);
      setAddOpen(false);
      setSheetOpen(true);
    } catch (e) {
      setPreviewUrl(null);
      if (e instanceof DocumentError) {
        toast.error(e.message);
      } else {
        toast.error(language === 'es' ? 'Error al analizar' : 'Analysis error');
      }
    }
  };

  const handleConfirmExtraction = async (data: any) => {
    if (!extraction) return;
    try {
      // The sheet has no access to the USD rate, so it always sends 1.
      const fxRate = data.currency === 'USD' ? (usdRate ?? data.fxRate) : 1;
      await confirmTransaction(extraction.receiptId, { ...data, fxRate });
      setSheetOpen(false);
      setExtraction(null);
      setPreviewUrl(null);
      // Written outside React Query, so the list has to be told to refetch.
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      month.showMonthOf(data.occurredOn);
      toast.success(language === 'es' ? 'Comprobante guardado' : 'Receipt saved');
    } catch {
      toast.error(language === 'es' ? 'Error al confirmar' : 'Confirmation error');
    }
  };

  const handleDelete = (tx: Transaction) => {
    deleteTx.mutate(tx.id, {
      onSuccess: () =>
        // A long swipe deletes outright, and the delete is permanent — without
        // an undo an accidental gesture silently costs data.
        toast.success(language === 'es' ? 'Movimiento eliminado' : 'Transaction deleted', {
          action: {
            label: t('undo'),
            onClick: () => {
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
              });
            },
          },
        }),
      onError: () => toast.error(language === 'es' ? 'Error al eliminar' : 'Delete error'),
    });
  };

  const handleSaveEdit = async (data: Partial<Transaction>) => {
    if (!editingTx) return;
    try {
      // Switching currency has to re-price the transaction, otherwise the ARS
      // totals keep using the old rate.
      let fxRate = editingTx.fxRate;
      if (data.currency && data.currency !== editingTx.currency) {
        if (data.currency === 'USD') {
          if (!usdRate) {
            toast.error(
              language === 'es'
                ? 'No pude obtener la cotización del dólar.'
                : "Couldn't fetch the USD rate.",
            );
            return;
          }
          fxRate = usdRate;
        } else {
          fxRate = 1;
        }
      }
      await updateTx.mutateAsync({ id: editingTx.id, ...data, fxRate });
      setEditingTx(null);
      if (data.occurredOn) month.showMonthOf(data.occurredOn);
      toast.success(language === 'es' ? 'Cambios guardados' : 'Changes saved');
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Error saving');
    }
  };

  const groupLabel = (key: string) => {
    if (key === 'today') return t('today');
    if (key === 'thisWeek') return t('thisWeek');
    if (key === 'thisMonth') return t('thisMonth');
    return format(parseDay(key), 'd MMMM', { locale: language === 'es' ? es : enUS });
  };

  return (
    <>
      <PageShell>
        <MoneyHeader
          month={month.month}
          direction={month.direction}
          isCurrentMonth={month.isCurrentMonth}
          onPrev={month.prev}
          onNext={month.next}
          onToday={month.today}
          income={summary.income}
          expense={summary.expense}
          filter={filter}
          onFilterChange={setFilter}
        />

        {isLoading ? (
          <TransactionList groups={[]} label={groupLabel} onEdit={setEditingTx} onDelete={handleDelete} loading />
        ) : groups.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <p className="mx-auto max-w-xs text-[15px] leading-relaxed text-ink-tertiary">
              {hasAnyEver ? t('noTransactionsThisMonth') : t('expenseWelcome')}
            </p>
          </div>
        ) : (
          <TransactionList
            groups={groups}
            label={groupLabel}
            onEdit={setEditingTx}
            onDelete={handleDelete}
          />
        )}
      </PageShell>

      <FloatingActionButton onClick={() => setAddOpen(true)} label={t('addTransaction')} />

      <BottomSheetAddExpense
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setPending(null);
        }}
        type={mode}
        onTypeChange={setMode}
        onParse={handleSend}
        pending={pending}
        onConfirm={handleConfirmPending}
        onCancelPending={() => setPending(null)}
        onUpload={handleUpload}
        saving={createTx.isPending}
      />

      <DocumentAnalysisSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        extraction={extraction}
        previewUrl={previewUrl}
        onConfirm={handleConfirmExtraction}
      />

      <EditTransactionSheet
        open={!!editingTx}
        onOpenChange={(open) => { if (!open) setEditingTx(null); }}
        transaction={editingTx}
        onSave={handleSaveEdit}
        onDelete={handleDelete}
        loading={updateTx.isPending}
      />
    </>
  );
}
