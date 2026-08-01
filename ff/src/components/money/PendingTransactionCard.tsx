import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { CATEGORY_ICONS } from '@/domain/categories';
import { formatCurrency, formatDate } from '@/lib/format';
import { SPRING } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import type { ParsedTransaction } from '@/domain/parser';

interface PendingTransactionCardProps {
  parsed: ParsedTransaction;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

/**
 * What the parser understood, shown for confirmation inside the add sheet.
 *
 * This used to appear as a dashed bubble in the middle of the list while the
 * composer sat at the bottom — the two halves of one action, in two places.
 */
export function PendingTransactionCard({
  parsed,
  onConfirm,
  onCancel,
  loading,
}: PendingTransactionCardProps) {
  const { t, language } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const icon = CATEGORY_ICONS[parsed.category] ?? '💰';
  const sign = parsed.type === 'expense' ? '-' : '+';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-surface-muted px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-[17px] leading-none">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-tight text-ink">
            {categoryLabel(parsed.category)}
          </p>
          {parsed.description && (
            <p className="truncate text-[13px] leading-tight text-ink-secondary">
              {parsed.description}
            </p>
          )}
          <p className="mt-0.5 text-[12px] leading-tight text-ink-tertiary">
            {formatDate(parsed.date)}
            {parsed.calculation && ` · ${parsed.calculation}`}
          </p>
        </div>
        <span
          className={cn(
            'tnum shrink-0 text-[15px] font-semibold',
            parsed.type === 'expense' ? 'text-expense' : 'text-income',
          )}
        >
          {sign}
          {formatCurrency(parsed.amount, parsed.currency)}
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={loading}>
          {t('cancel')}
        </Button>
        <Button className="flex-1" onClick={onConfirm} loading={loading}>
          {language === 'es' ? 'Guardar' : 'Save'}
        </Button>
      </div>
    </motion.div>
  );
}
