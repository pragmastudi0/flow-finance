import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { isThisWeek, isToday, format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import {
  useTransactions,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from '@/hooks/useTransactions';
import { parseEntry, type ParsedTransaction } from '@/domain/parser';
import { analyzeDocument, confirmTransaction, DocumentError } from '@/lib/receipts';
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
  const { data: transactions, isLoading } = useTransactions();
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();
  const updateTx = useUpdateTransaction();

  const [mode, setMode] = useState<TxType>('expense');
  const [pending, setPending] = useState<ParsedTransaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [extraction, setExtraction] = useState<AnalyzedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
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

  const hasAny = pending || (transactions && transactions.length > 0);

  const prevMonth = () => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  const nextMonth = () => setSelectedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));

  const handleSend = (text: string) => {
    const parsed = parseEntry(text, { type: mode });
    if (parsed) {
      setPending(parsed);
    } else {
      toast.error(t('couldNotDetect'));
    }
  };

  const handleConfirmPending = async () => {
    if (!pending || createTx.isPending) return;
    try {
      await createTx.mutateAsync({
        type: pending.type,
        amount: pending.amount,
        currency: pending.currency,
        fx_rate: pending.fxRate,
        category: pending.category,
        description: pending.description,
        occurred_on: pending.date,
        raw_input: pending.rawInput,
        calculation: pending.calculation,
      });
      setPending(null);
      toast.success(t('save'));
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Error saving');
    }
  };

  const handleUpload = async (file: File) => {
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
      await confirmTransaction(extraction.receiptId, data);
      setSheetOpen(false);
      setExtraction(null);
      setPreviewUrl(null);
      toast.success(t('save'));
    } catch {
      toast.error(language === 'es' ? 'Error al confirmar' : 'Confirmation error');
    }
  };

  const handleDelete = (id: string) => {
    deleteTx.mutate(id, {
      onSuccess: () => toast.success(t('delete')),
      onError: () => toast.error(language === 'es' ? 'Error al eliminar' : 'Delete error'),
    });
  };

  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx);
  };

  const handleSaveEdit = async (data: Partial<Transaction>) => {
    if (!editingTx) return;
    try {
      await updateTx.mutateAsync({ id: editingTx.id, ...data });
      setEditingTx(null);
      toast.success(t('save'));
    } catch {
      toast.error(language === 'es' ? 'Error al guardar' : 'Error saving');
    }
  };

  const monthLabel = format(selectedMonth, language === 'es' ? "MMMM 'de' yyyy" : 'MMMM yyyy');

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
    <div className="flex flex-col bg-gradient-to-b from-background to-muted/30 min-h-0">
      <header className="sticky top-0 z-10 shrink-0 border-b bg-background/80 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-base font-bold">{t('appTitle')}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {t('totalSpent')}:{' '}
                <span className="font-semibold text-red-600">
                  {formatCurrency(monthSummary.spent)}
                </span>
              </span>
              <span>
                {t('totalEarned')}:{' '}
                <span className="font-semibold text-green-600">
                  {formatCurrency(monthSummary.earned)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
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
              <span className="text-sm font-semibold capitalize">{monthLabel}</span>
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

          {!hasAny && !isLoading && (
            <div className="px-4 py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {t(mode === 'expense' ? 'expenseWelcome' : 'incomeWelcome')}
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
                          {format(new Date(day + 'T12:00:00'), 'd MMMM')}
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
