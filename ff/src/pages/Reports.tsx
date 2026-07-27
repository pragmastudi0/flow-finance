import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  startOfWeek,
  startOfMonth,
  startOfYear,
  format,
  eachDayOfInterval,
} from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { Download, Settings, Target } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

import { cn } from '@/lib/cn';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { useTransactions } from '@/hooks/useTransactions';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/domain/categories';
import { formatCurrency, formatDate } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
  const [chartView, setChartView] = useState<'pie' | 'bar'>('pie');

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
    const rows = transactions.map((tx) => ({
      [t('date')]: tx.occurredOn,
      [t('description')]: tx.description,
      [t('category')]: tx.category,
      [t('type')]: tx.type === 'expense' ? t('expenseType') : t('incomeType'),
      [t('amount')]: tx.amount,
      Currency: tx.currency,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('sheetTransactions'));
    XLSX.writeFile(wb, `${t('exportFilename')}-${dateRange.start}.xlsx`);
    toast.success(t('exportToExcel'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-full bg-gradient-to-br from-slate-50 via-white to-slate-50 p-4 sm:p-6"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{t('reportsTitle')}</h1>
            <p className="text-sm text-slate-500">{t('reportsSubtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/Savings">
              <Button variant="outline">
                <Target className="h-4 w-4" />
                {t('savings')}
              </Button>
            </Link>
            <Link to="/Settings">
              <Button variant="outline" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4" />
              {t('exportToExcel')}
            </Button>
          </div>
        </div>

        <div className="flex w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 sm:w-fit">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                period === p
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              {p === 'all' ? t('allTime') : t(p)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t('totalIncome')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">
                {formatCurrency(totalIncome)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t('totalExpenses')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-500">
                {formatCurrency(totalExpenses)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t('balance')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  'text-2xl font-bold',
                  balance >= 0 ? 'text-emerald-600' : 'text-red-500',
                )}
              >
                {formatCurrency(balance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {t('savingsRate')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={cn(
                  'text-2xl font-bold',
                  savingsRate >= 0 ? 'text-emerald-600' : 'text-red-500',
                )}
              >
                {savingsRate.toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">{t('visualizations')}</CardTitle>
            <div className="flex gap-1 rounded-md bg-slate-100 p-1">
              <button
                onClick={() => setChartView('pie')}
                className={cn(
                  'rounded px-3 py-2 text-sm font-medium transition-colors',
                  chartView === 'pie'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {t('pie')}
              </button>
              <button
                onClick={() => setChartView('bar')}
                className={cn(
                  'rounded px-3 py-2 text-sm font-medium transition-colors',
                  chartView === 'bar'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                {t('bar')}
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {chartView === 'pie' ? (
                expensesByCategory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensesByCategory}
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        dataKey="value"
                        label={({ name }) => categoryLabel(name)}
                      >
                        {expensesByCategory.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={CATEGORY_COLORS[entry.name] || '#64748b'}
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(name: string) => categoryLabel(name)}
                      />
                      <Legend formatter={(name: string) => categoryLabel(name)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    {t('noData')}
                  </div>
                )
              ) : barData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  {t('noData')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('sheetTransactions')}</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                {t('noData')}
              </div>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">
                        {CATEGORY_ICONS[tx.category] || '📄'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {tx.description}
                        </p>
                        <p className="text-xs text-slate-400">
                          {tx.occurredOn ? formatDate(tx.occurredOn) : ''} ·{' '}
                          {categoryLabel(tx.category)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        tx.type === 'expense' ? 'text-red-500' : 'text-emerald-600',
                      )}
                    >
                      {tx.type === 'expense' ? '-' : '+'}
                      {formatCurrency(tx.amount, tx.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
