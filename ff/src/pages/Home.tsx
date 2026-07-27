import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { isSameMonth, isThisWeek, isToday } from 'date-fns';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useTransactions, useCreateTransaction, useDeleteTransaction } from '@/hooks/useTransactions';
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

export default function Home() {
  const { t, language } = useLanguage();
  const { data: transactions, isLoading } = useTransactions();
  const createTx = useCreateTransaction();
  const deleteTx = useDeleteTransaction();

  const [mode, setMode] = useState<TxType>('expense');
  const [pending, setPending] = useState<ParsedTransaction | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [extraction, setExtraction] = useState<AnalyzedDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pending]);

  const monthlySummary = useMemo(() => {
    if (!transactions) return { spent: 0, earned: 0 };
    const now = new Date();
    return transactions.reduce(
      (acc, tx) => {
        const d = new Date(tx.occurredOn + 'T12:00:00');
        if (!isSameMonth(d, now)) return acc;
        const base = baseAmount(tx);
        if (tx.type === 'expense') acc.spent += base;
        else acc.earned += base;
        return acc;
      },
      { spent: 0, earned: 0 },
    );
  }, [transactions]);

  const groups = useMemo(() => {
    const g: Record<string, Transaction[]> = { today: [], thisWeek: [], thisMonth: [], older: [] };
    if (!transactions) return g;
    const now = new Date();
    for (const tx of transactions) {
      const d = new Date(tx.occurredOn + 'T12:00:00');
      if (isToday(d)) g.today.push(tx);
      else if (isThisWeek(d, { weekStartsOn: 1 })) g.thisWeek.push(tx);
      else if (isSameMonth(d, now)) g.thisMonth.push(tx);
      else g.older.push(tx);
    }
    return g;
  }, [transactions]);

  const hasAny = pending || (transactions && transactions.length > 0);

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

  const periodLabel = (key: string) => {
    if (language === 'es') {
      return key === 'today' ? 'Hoy' : key === 'thisWeek' ? 'Esta semana' : key === 'thisMonth' ? 'Este mes' : 'Anteriores';
    }
    return key === 'today' ? 'Today' : key === 'thisWeek' ? 'This Week' : key === 'thisMonth' ? 'This Month' : 'Older';
  };

  const periodKeys = ['today', 'thisWeek', 'thisMonth', 'older'] as const;

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-background to-muted/30">
      <header className="shrink-0 border-b bg-background/80 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">{t('appTitle')}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {t('totalSpent')}:{' '}
                <span className="font-semibold text-red-600">
                  {formatCurrency(monthlySummary.spent)}
                </span>
              </span>
              <span>
                {t('totalEarned')}:{' '}
                <span className="font-semibold text-green-600">
                  {formatCurrency(monthlySummary.earned)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              onClick={() => { setMode('expense'); setPending(null); }}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
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
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
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

      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl py-4">
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
            periodKeys.map((period) => {
              const txs = groups[period];
              if (!txs || txs.length === 0) return null;
              return (
                <div key={period} className="mb-4">
                  <h3 className="px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {periodLabel(period)}
                  </h3>
                  <TransactionList
                    transactions={txs}
                    onDelete={handleDelete}
                  />
                </div>
              );
            })
          )}
        </div>
      </main>

      <ChatInput onSend={handleSend} onUpload={handleUpload} loading={createTx.isPending} />

      <DocumentAnalysisSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        extraction={extraction}
        previewUrl={previewUrl}
        onConfirm={handleConfirmExtraction}
      />
    </div>
  );
}
