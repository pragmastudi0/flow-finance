import { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';

import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { useCategoryVisuals } from '@/hooks/useCategoryOptions';
import { filterCategoryTransactions, totalBaseAmount, type ReportTransactionType } from '@/domain/reporting';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { PaymentMethod, Transaction } from '@/types/models';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string | null;
  type: ReportTransactionType;
  transactions: Transaction[];
  categories: string[];
  onEdit: (transaction: Transaction) => void;
}

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'paymentCash',
  transfer: 'paymentTransfer',
  debit: 'paymentDebit',
  credit: 'paymentCredit',
  other: 'paymentOther',
};

export function CategoryDetailSheet({
  open,
  onOpenChange,
  category,
  type,
  transactions,
  categories,
  onEdit,
}: Props) {
  const { t } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const { iconOf, colorOf } = useCategoryVisuals();
  const [filterCategory, setFilterCategory] = useState(category ?? '');
  const [filterType, setFilterType] = useState<ReportTransactionType>(type);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setFilterCategory(category ?? '');
    setFilterType(type);
    setStartDate('');
    setEndDate('');
    setPaymentMethod('all');
    setSearch('');
  }, [open, category, type]);

  const filtered = useMemo(
    () => filterCategoryTransactions(transactions, {
      category: filterCategory,
      type: filterType,
      startDate,
      endDate,
      paymentMethod,
      search,
    }),
    [transactions, filterCategory, filterType, startDate, endDate, paymentMethod, search],
  );

  const total = useMemo(() => totalBaseAmount(filtered), [filtered]);
  const hasFilters = Boolean(startDate || endDate || search || paymentMethod !== 'all' || filterType === 'all' || filterCategory !== category);

  const clearFilters = () => {
    setFilterCategory(category ?? '');
    setFilterType(type);
    setStartDate('');
    setEndDate('');
    setPaymentMethod('all');
    setSearch('');
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={category ? categoryLabel(category) : t('categoryDetail')}
      className="sm:mx-auto sm:max-w-2xl"
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-surface-muted/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] text-ink-tertiary">{t('categoryDetail')}</p>
              <p className="tnum mt-0.5 truncate text-[26px] font-bold leading-tight text-ink">
                {formatCurrency(total)}
              </p>
            </div>
            <p className="shrink-0 text-right text-[13px] text-ink-secondary">
              {filtered.length} {filtered.length === 1 ? t('transactionWord') : t('transactionsWord')}
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-hairline p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink">
              <SlidersHorizontal className="h-4 w-4" />
              {t('filters')}
            </div>
            {hasFilters && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                {t('clearFilters')}
              </Button>
            )}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchMovement')}
              className="pl-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Input aria-label={t('fromDate')} type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input aria-label={t('toDate')} type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Select value={filterCategory || '__all__'} onValueChange={(value) => setFilterCategory(value === '__all__' ? '' : value)}>
              <SelectTrigger aria-label={t('category')}><SelectValue placeholder={t('category')} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t('allCategories')}</SelectItem>
                {categories.map((value) => <SelectItem key={value} value={value}>{categoryLabel(value)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(value) => setFilterType(value as ReportTransactionType)}>
              <SelectTrigger aria-label={t('type')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allTypes')}</SelectItem>
                <SelectItem value="expense">{t('expenseType')}</SelectItem>
                <SelectItem value="income">{t('incomeType')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod | 'all')}>
              <SelectTrigger aria-label={t('paymentMethod')}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allPaymentMethods')}</SelectItem>
                {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((value) => (
                  <SelectItem key={value} value={value}>{t(PAYMENT_LABEL[value] as never)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-[14px] text-ink-tertiary">{t('noMovementsInFilter')}</div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((movement) => (
              <li key={movement.id}>
                <button
                  type="button"
                  onClick={() => onEdit(movement)}
                  className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3 text-left transition-colors hover:border-ink/20 hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[17px]" style={{ color: colorOf(movement.category) }}>
                      {iconOf(movement.category)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-medium text-ink">
                            {movement.description || categoryLabel(movement.category)}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-ink-tertiary">
                            {formatDate(movement.occurredOn)} · {categoryLabel(movement.category)}
                          </span>
                        </span>
                        <span className={cn('tnum shrink-0 text-[15px] font-semibold', movement.type === 'expense' ? 'text-expense' : 'text-income')}>
                          {formatCurrency(totalBaseAmount([movement]))}
                        </span>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-2 text-[12px] text-ink-tertiary">
                        <span>{movement.type === 'expense' ? t('expenseType') : t('incomeType')}</span>
                        {movement.paymentMethod && <span>· {t(PAYMENT_LABEL[movement.paymentMethod] as never)}</span>}
                        {movement.currency !== 'ARS' && <span>· {formatCurrency(movement.amount, movement.currency)}</span>}
                      </span>
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-hairline pt-3 text-[15px] font-semibold text-ink">
          <span>{t('totalLabel')}</span>
          <span className="tnum">{formatCurrency(total)}</span>
        </div>
      </div>
    </BottomSheet>
  );
}
