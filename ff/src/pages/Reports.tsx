import { useMemo, useState } from 'react';
import {
  startOfWeek,
  startOfMonth,
  startOfYear,
  format,
  eachDayOfInterval,
} from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { useTransactions } from '@/hooks/useTransactions';
import { CATEGORY_ICONS } from '@/domain/categories';
import { formatCurrency, formatDate } from '@/lib/format';
import { exportTransactions } from '@/lib/exportReport';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { AnimatedSegment } from '@/components/money/AnimatedSegment';
import { CategoryChart, type ChartView } from '@/components/money/CategoryChart';

type Period = 'week' | 'month' | 'year' | 'all';

const PERIODS: Period[] = ['week', 'month', 'year', 'all'];

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = format(now, 'yyyy-MM-dd');
  let start: string;
  switch (period) {
    case 'week':
      start = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      break;
    case 'month':
      start = format(startOfMonth(now), 'yyyy-MM-dd');
      break;
    case 'year':
      start = format(startOfYear(now), 'yyyy-MM-dd');
      break;
    default:
      start = '2000-01-01';
  }
  return { start, end };
}

export default function Reports() {
  const { t, language } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const dateLocale = language === 'es' ? es : enUS;
  const [period, setPeriod] = useState<Period>('month');
  const [chartView, setChartView] = useState<ChartView>('pie');

  const dateRange = useMemo(() => getDateRange(period), [period]);
  const { data: transactions = [] } = useTransactions({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const expenses = useMemo(
    () => transactions.filter((tx) => tx.type === 'expense'),
    [transactions],
  );
  const incomes = useMemo(
    () => transactions.filter((tx) => tx.type === 'income'),
    [transactions],
  );

  const totalIncome = useMemo(
    () => incomes.reduce((sum, tx) => sum + tx.amount * (tx.fxRate ?? 1), 0),
    [incomes],
  );
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, tx) => sum + tx.amount * (tx.fxRate ?? 1), 0),
    [expenses],
  );
  const balance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((tx) => {
      const cat = tx.category || 'other';
      map.set(cat, (map.get(cat) || 0) + tx.amount * (tx.fxRate ?? 1));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  const barData = useMemo(() => {
    if (period === 'all' || period === 'year') {
      const map = new Map<string, number>();
      expenses.forEach((tx) => {
        // Parsed at local noon: `new Date('2026-07-01')` is UTC midnight, which
        // lands on the previous month in AR time.
        const monthKey = tx.occurredOn
          ? format(new Date(`${tx.occurredOn}T12:00:00`), 'MMM', { locale: dateLocale })
          : '?';
        map.set(monthKey, (map.get(monthKey) || 0) + tx.amount * (tx.fxRate ?? 1));
      });
      return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
    }
    const { start, end } = dateRange;
    const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
    return days.map((day) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const total = expenses
        .filter((tx) => tx.occurredOn && tx.occurredOn.startsWith(dayStr))
        .reduce((sum, tx) => sum + tx.amount * (tx.fxRate ?? 1), 0);
      return { name: format(day, 'dd/MM'), value: total };
    });
  }, [expenses, period, dateRange]);

  const handleExport = () => {
    exportTransactions(
      transactions,
      {
        date: t('date'), description: t('description'), category: t('category'),
        type: t('type'), amount: t('amount'),
        expense: t('expenseType'), income: t('incomeType'),
        sheet: t('sheetTransactions'), filename: t('exportFilename'),
      },
      dateRange.start,
    );
    toast.success(t('exportToExcel'));
  };

  return (
    <PageShell width="wide">
      <PageHeader
        title={t('reportsTitle')}
        subtitle={t('reportsSubtitle')}
        action={
          <Button variant="ghost" size="icon" onClick={handleExport} aria-label={t('exportToExcel')}>
            <Download className="h-[18px] w-[18px]" />
          </Button>
        }
      />

      <div className="space-y-7">
        <AnimatedSegment
          options={PERIODS.map((p) => ({ value: p, label: p === 'all' ? t('allTime') : t(p) }))}
          value={period}
          onChange={setPeriod}
          ariaLabel={t('period')}
        />

        {/* One card, four figures — the four separate bordered cards read as a
            dashboard rather than as a summary. */}
        <div className="rounded-2xl bg-surface-muted/60 px-5 py-5">
          <p className="text-[13px] font-medium text-ink-tertiary">{t('balance')}</p>
          <p
            className={cn(
              'tnum mt-1 text-[34px] font-bold leading-none tracking-[-0.03em]',
              balance < 0 ? 'text-expense' : 'text-ink',
            )}
          >
            {balance > 0 && '+'}
            {formatCurrency(balance)}
          </p>

          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-hairline pt-4">
            <Stat label={t('income')} value={formatCurrency(totalIncome)} tone="income" />
            <Stat label={t('expenses')} value={formatCurrency(totalExpenses)} tone="expense" />
            <Stat label={t('savingsRate')} value={`${savingsRate.toFixed(0)}%`} />
          </div>
        </div>

        <CategoryChart
          view={chartView}
          onViewChange={setChartView}
          byCategory={expensesByCategory}
          overTime={barData}
        />

        <section>
          <h2 className="pb-1.5 text-[15px] font-semibold text-ink">{t('sheetTransactions')}</h2>
          {transactions.length === 0 ? (
            <Empty text={t('noData')} />
          ) : (
            <ul className="-mx-5">
              {transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center gap-3 border-b border-hairline px-5 py-3 last:border-b-0"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[17px] leading-none">
                    {CATEGORY_ICONS[tx.category] || '📄'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-tight text-ink">
                      {categoryLabel(tx.category)}
                    </p>
                    {tx.description && (
                      <p className="truncate text-[13px] leading-tight text-ink-secondary">
                        {tx.description}
                      </p>
                    )}
                    <p className="mt-0.5 text-[12px] leading-tight text-ink-tertiary">
                      {tx.occurredOn ? formatDate(tx.occurredOn) : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'tnum shrink-0 text-[15px] font-semibold',
                      tx.type === 'expense' ? 'text-expense' : 'text-income',
                    )}
                  >
                    {tx.type === 'expense' ? '-' : '+'}
                    {formatCurrency(tx.amount, tx.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'expense' }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] leading-tight text-ink-tertiary">{label}</p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-[15px] font-semibold',
          tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-[14px] text-ink-tertiary">
      {text}
    </div>
  );
}
