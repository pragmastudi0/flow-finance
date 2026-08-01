import { useLanguage } from '@/i18n/LanguageProvider';
import { BalanceCard } from './BalanceCard';
import { MonthSelector } from './MonthSelector';
import { AnimatedSegment } from './AnimatedSegment';

export type TxFilter = 'all' | 'expense' | 'income';

interface MoneyHeaderProps {
  month: Date;
  direction: 1 | -1;
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  income: number;
  expense: number;
  filter: TxFilter;
  onFilterChange: (filter: TxFilter) => void;
}

/**
 * Home's top block: which month, what's left, and what to show.
 *
 * The balance deliberately scrolls away while the filter sticks — a 40px figure
 * pinned to the top eats half an iPhone SE. That's the Wallet/Copilot pattern.
 */
export function MoneyHeader({
  month,
  direction,
  isCurrentMonth,
  onPrev,
  onNext,
  onToday,
  income,
  expense,
  filter,
  onFilterChange,
}: MoneyHeaderProps) {
  const { t } = useLanguage();

  const options = [
    { value: 'all' as const, label: t('allTransactions') },
    { value: 'expense' as const, label: t('expenses') },
    { value: 'income' as const, label: t('income') },
  ];

  return (
    <header>
      <div className="pt-3">
        <MonthSelector
          month={month}
          direction={direction}
          isCurrentMonth={isCurrentMonth}
          onPrev={onPrev}
          onNext={onNext}
          onToday={onToday}
        />
      </div>

      <div className="pb-8 pt-7">
        <BalanceCard income={income} expense={expense} />
      </div>

      {/* Bleeds past the page gutter so the blur reaches both edges. */}
      <div className="sticky top-0 z-10 -mx-5 bg-surface/80 px-5 pb-3 pt-2 backdrop-blur-xl">
        <AnimatedSegment
          options={options}
          value={filter}
          onChange={onFilterChange}
          ariaLabel={t('allTransactions')}
        />
      </div>
    </header>
  );
}
