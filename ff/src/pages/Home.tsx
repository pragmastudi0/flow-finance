import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

import { useLanguage } from '@/i18n/LanguageProvider';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategoryLearnings } from '@/hooks/useCategories';
import { useMonthFilter } from '@/hooks/useMonthFilter';
import { useTransactionActions } from '@/hooks/useTransactionActions';
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

  const [mode, setMode] = useState<TxType>('expense');
  const [filter, setFilter] = useState<TxFilter>('all');
  const [pending, setPending] = useState<ParsedTransaction | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [extraction, setExtraction] = useState<AnalyzedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data: learnings } = useCategoryLearnings(mode);
  const month = useMonthFilter();
  const actions = useTransactionActions({ showMonthOf: month.showMonthOf });

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

  const groups = useMemo(() => {
    const visible =
      filter === 'all' ? monthTransactions : monthTransactions.filter((tx) => tx.type === filter);
    return groupTransactions(visible, { isCurrentMonth: month.isCurrentMonth, now: new Date() });
  }, [monthTransactions, filter, month.isCurrentMonth]);

  /** True when the text was understood; the sheet clears its field on that. */
  const handleParse = (text: string): boolean => {
    // Without `learnings` the per-user categories are ignored, and without
    // `usdRate` every USD entry is rejected outright.
    const parsed = parseEntry(text, {
      type: mode,
      learnings: learnings ?? [],
      usdRate: actions.usdRate,
    });
    if (parsed) {
      setPending(parsed);
      return true;
    }
    if (/\busd\b|u\$s/i.test(text) && !actions.usdRate) {
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
    if (!pending) return;
    if (await actions.create(pending)) {
      setPending(null);
      setAddOpen(false);
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
      setAnalysisOpen(true);
    } catch (e) {
      setPreviewUrl(null);
      toast.error(
        e instanceof DocumentError
          ? e.message
          : language === 'es' ? 'Error al analizar' : 'Analysis error',
      );
    }
  };

  const handleConfirmExtraction = async (data: any) => {
    if (!extraction) return;
    try {
      // The sheet has no access to the USD rate, so it always sends 1.
      const fxRate = data.currency === 'USD' ? (actions.usdRate ?? data.fxRate) : 1;
      await confirmTransaction(extraction.receiptId, { ...data, fxRate });
      setAnalysisOpen(false);
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
          <TransactionList groups={[]} label={groupLabel} onEdit={setEditing} onDelete={actions.remove} loading />
        ) : groups.length === 0 ? (
          <div className="px-4 py-20 text-center">
            <p className="mx-auto max-w-xs text-[15px] leading-relaxed text-ink-tertiary">
              {transactions?.length ? t('noTransactionsThisMonth') : t('expenseWelcome')}
            </p>
          </div>
        ) : (
          <TransactionList
            groups={groups}
            label={groupLabel}
            onEdit={setEditing}
            onDelete={actions.remove}
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
        onParse={handleParse}
        pending={pending}
        onConfirm={handleConfirmPending}
        onCancelPending={() => setPending(null)}
        onUpload={handleUpload}
        saving={actions.creating}
      />

      <DocumentAnalysisSheet
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        extraction={extraction}
        previewUrl={previewUrl}
        onConfirm={handleConfirmExtraction}
      />

      <EditTransactionSheet
        open={!!editing}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        transaction={editing}
        onSave={async (data) => {
          if (editing && (await actions.save(editing, data))) setEditing(null);
        }}
        onDelete={actions.remove}
        loading={actions.saving}
      />
    </>
  );
}
