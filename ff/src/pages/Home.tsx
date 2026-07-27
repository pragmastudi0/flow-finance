import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { isThisWeek, isToday, format } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  useTransactions,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions';
import { useCategoryLearnings } from '@/hooks/useCategories';
import { useBlueRate } from '@/hooks/useExchangeRate';
import { parseEntry, type ParsedTransaction } from '@/domain/parser';
import { analyzeDocument, confirmTransaction, DocumentError } from '@/lib/receipts';
import { isDemoMode } from '@/lib/supabase';
import type { AnalyzedDocument } from '@/lib/receipts';
import { baseAmount } from '@/types/models';
import type { Transaction } from '@/types/models';
import type { TxType } from '@/domain/categories';
import { formatCurrency } from '@/lib/format';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatBubble } from '@/components/chat/ChatBubble';
import { TransactionList } from '@/components/chat/TransactionList';
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
  const { data: learnings } = useCategoryLearnings(mode);
  const { data: usdRate } = useBlueRate();
  const [pending, setPending] = useState<ParsedTransaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [extraction, setExtraction] = useState<AnalyzedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const pendingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) {
      // Scrolls whichever ancestor actually scrolls, so it keeps working
      // regardless of where the scroll container lives.
      pendingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [pending]);

  const monthTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((tx) => {
      const d = new Date(tx.occurredOn + 'T12:00:00');
      return d.getMonth() === selectedMonth.getMonth() && d.getFullYear() === selectedMonth.getFullYear();
    });
  }, [transactions, selectedMonth]);

  const isCurrentMonth = selectedMonth.getMonth() === now.getMonth() && selectedMonth.getFullYear() === now.getFullYear();

  const monthSummary = useMemo(() => {
    const spent = monthTransactions.filter((tx) => tx.type === 'expense').reduce((a, t) => a + baseAmount(t), 0);
    const earned = monthTransactions.filter((tx) => tx.type === 'income').reduce((a, t) => a + baseAmount(t), 0);
    return { spent, earned };
  }, [monthTransactions]);

  const groups = useMemo(() => {
    if (isCurrentMonth) {
      const g: Record<string, Transaction[]> = { today: [], thisWeek: [], thisMonth: [] };
      for (const tx of monthTransactions) {
        const d = new Date(tx.occurredOn + 'T12:00:00');
        if (isToday(d)) g.today.push(tx);
        else if (isThisWeek(d, { weekStartsOn: 1 })) g.thisWeek.push(tx);
        else g.thisMonth.push(tx);
      }
      return g;
    }
    const g: Record<string, Transaction[]> = {};
    for (const tx of monthTransactions) {
      if (!g[tx.occurredOn]) g[tx.occurredOn] = [];
      g[tx.occurredOn].push(tx);
    }
    return g;
  }, [monthTransactions, isCurrentMonth]);

  /** The empty state is about the month on screen, not the whole history. */
  const hasAny = !!pending || monthTransactions.length > 0;
  const hasAnyEver = !!transactions && transactions.length > 0;

  const prevMonth = () => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  /** Brings the month containing `isoDate` (yyyy-MM-dd) into view. */
  const showMonthOf = (isoDate: string) => {
    const d = new Date(`${isoDate}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    setSelectedMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const handleSend = (text: string) => {
    // Without `learnings` the per-user categories were ignored, and without
    // `usdRate` every USD entry was rejected outright.
    const parsed = parseEntry(text, {
      type: mode,
      learnings: learnings ?? [],
      usdRate: usdRate ?? null,
    });
    if (parsed) {
      setPending(parsed);
      return;
    }
    const isUsd = /\busd\b|u\$s/i.test(text);
    if (isUsd && !usdRate) {
      toast.error(
        language === 'es'
          ? 'No pude obtener la cotización del dólar. Probá de nuevo en unos segundos.'
          : "Couldn't fetch the USD rate. Try again in a few seconds.",
      );
      return;
    }
    toast.error(t('couldNotDetect'));
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
      // A transaction saved while browsing another month would otherwise land
      // off-screen.
      showMonthOf(pending.date);
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
      showMonthOf(data.occurredOn);
      toast.success(language === 'es' ? 'Comprobante guardado' : 'Receipt saved');
    } catch {
      toast.error(language === 'es' ? 'Error al confirmar' : 'Confirmation error');
    }
  };

  const handleDelete = (id: string) => {
    deleteTx.mutate(id, {
      onSuccess: () =>
        toast.success(language === 'es' ? 'Movimiento eliminado' : 'Transaction deleted'),
      onError: () => toast.error(language === 'es' ? 'Error al eliminar' : 'Delete error'),
    });
  };

  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx);
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
      if (data.occurredOn) showMonthOf(data.occurredOn);
      toast.success(language === 'es' ? 'Cambios guardados' : 'Changes saved');
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Error saving');
    }
  };

  // Without an explicit locale date-fns falls back to English ("July De 2026").
  const dateLocale = language === 'es' ? es : enUS;
  const monthLabel = format(
    selectedMonth,
    language === 'es' ? "MMMM 'de' yyyy" : 'MMMM yyyy',
    { locale: dateLocale },
  );

  const periodLabel = (key: string) => {
    if (language === 'es') {
      if (key === 'today') return 'Hoy';
      if (key === 'thisWeek') return 'Esta semana';
      return 'Este mes';
    }
    if (key === 'today') return 'Today';
    if (key === 'thisWeek') return 'This Week';
    return 'This Month';
  };

  const groupKeys = Object.keys(groups);

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background/90 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">{t('appTitle')}</h1>
            <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">
                {t('totalSpent')}:{' '}
                <span className="font-semibold text-red-600">
                  {formatCurrency(monthSummary.spent)}
                </span>
              </span>
              <span className="whitespace-nowrap">
                {t('totalEarned')}:{' '}
                <span className="font-semibold text-green-600">
                  {formatCurrency(monthSummary.earned)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-lg border p-0.5">
            <button
              onClick={() => { setMode('expense'); setPending(null); }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'expense'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('expenses')}
            </button>
            <button
              onClick={() => { setMode('income'); setPending(null); }}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                mode === 'income'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('income')}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1">
        <div className="mx-auto max-w-2xl py-4">
          <div className="flex items-center justify-between px-4 pb-2">
            <button
              onClick={prevMonth}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              {/* `capitalize` would also uppercase the "de" in "julio de 2026". */}
              <span className="text-sm font-semibold first-letter:uppercase">{monthLabel}</span>
              {!isCurrentMonth && (
                <button
                  onClick={() => setSelectedMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
                  className="min-h-[44px] px-2 text-xs font-medium text-primary hover:underline"
                >
                  {language === 'es' ? 'Hoy' : 'Today'}
                </button>
              )}
            </div>
            <button
              onClick={nextMonth}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div ref={pendingRef}>
            <AnimatePresence>
              {pending && (
                <motion.div
                  key="pending"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="px-4 pb-2"
                >
                  <ChatBubble
                    transaction={pending}
                    onEdit={handleConfirmPending}
                    onDelete={() => setPending(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!hasAny && !isLoading && (
            <div className="px-4 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {hasAnyEver
                  ? language === 'es'
                    ? 'No hay movimientos en este mes.'
                    : 'No transactions this month.'
                  : t(mode === 'expense' ? 'expenseWelcome' : 'incomeWelcome')}
              </p>
            </div>
          )}

          {isLoading ? (
            <TransactionList transactions={[]} loading />
          ) : (
            <div className="space-y-4">
              {isCurrentMonth ? (
                ['today', 'thisWeek', 'thisMonth'].map((period) => {
                  const txs = groups[period] as Transaction[] | undefined;
                  if (!txs || txs.length === 0) return null;
                  return (
                    <div key={period}>
                      <h3 className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {periodLabel(period)}
                      </h3>
                      <TransactionList
                        transactions={txs}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                      />
                    </div>
                  );
                })
              ) : (
                groupKeys
                  .sort((a, b) => b.localeCompare(a))
                  .map((day) => {
                    const txs = groups[day] as Transaction[];
                    return (
                      <div key={day}>
                        <h3 className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {format(new Date(day + 'T12:00:00'), 'd MMMM', { locale: dateLocale })}
                        </h3>
                        <TransactionList
                          transactions={txs}
                          onDelete={handleDelete}
                          onEdit={handleEdit}
                        />
                      </div>
                    );
                  })
              )}
            </div>
          )}
        </div>
      </div>

      <ChatInput onSend={handleSend} onUpload={handleUpload} loading={createTx.isPending} />

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
        loading={updateTx.isPending}
      />
    </div>
  );
}
