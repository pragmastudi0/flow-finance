import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatCurrency } from '@/lib/format';
import { SPRING_SOFT } from '@/lib/motion';

interface BalanceCardProps {
  income: number;
  expense: number;
}

/** Discreet, unboxed: a label over a figure. A bordered chip here reads as a form. */
function Chip({ label, value, tone }: { label: string; value: number; tone: 'income' | 'expense' }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate text-[13px] text-ink-tertiary">{label}</p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-[15px] font-semibold',
          tone === 'income' ? 'text-income' : 'text-expense',
        )}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

/**
 * The one thing the screen is about: what's left this month.
 *
 * Home used to show only "spent" and "earned" in 12px text beside the app
 * title — the number people actually open the app for was never on screen.
 */
export function BalanceCard({ income, expense }: BalanceCardProps) {
  const { t } = useLanguage();
  const balance = income - expense;
  const negative = balance < 0;

  return (
    <div>
      <p className="text-[13px] font-medium text-ink-tertiary">{t('monthBalance')}</p>
      <motion.p
        key={balance}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING_SOFT}
        className={cn(
          'tnum mt-1 text-[40px] font-bold leading-none tracking-[-0.03em]',
          negative ? 'text-expense' : 'text-ink',
        )}
      >
        {!negative && balance > 0 && '+'}
        {formatCurrency(balance)}
      </motion.p>

      <div className="mt-5 flex items-start gap-6">
        <Chip label={t('income')} value={income} tone="income" />
        <div className="h-8 w-px shrink-0 bg-hairline" />
        <Chip label={t('expenses')} value={expense} tone="expense" />
      </div>
    </div>
  );
}
