import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { merchantLabel } from '@/domain/reconciliation/normalize';
import type { MatchSuggestion } from '@/domain/reconciliation/types';

interface Props {
  suggestion: MatchSuggestion;
  onAccept: (options?: { adoptCardAmount?: boolean }) => void;
  onReject: () => void;
  busy?: boolean;
}

/**
 * One proposed pair.
 *
 * The two amounts sit side by side with the difference spelled out, because
 * the difference is the decision: the card charged something other than what
 * the user wrote down, and only they can say which figure is right. Accepting
 * keeps their amount unless they explicitly pick the card's — nothing here
 * rewrites a number on its own.
 */
export function MatchCard({ suggestion, onAccept, onReject, busy }: Props) {
  const { t } = useLanguage();
  const [showDetail, setShowDetail] = useState(false);
  const { movement, expense, score, difference } = suggestion;
  const high = suggestion.confidence === 'high';

  return (
    <div className="rounded-2xl bg-surface-muted/60 p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold',
            high ? 'bg-income/15 text-income' : 'bg-amber-500/15 text-amber-600',
          )}
        >
          {high ? '✓' : '?'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
          {merchantLabel(movement.description)}
        </span>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-tertiary"
        >
          {score.total}%
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showDetail && 'rotate-180')} />
        </button>
      </div>

      {!high && (
        <p className="mt-1 pl-8 text-[13px] text-ink-tertiary">{t('possibleMatch')}</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Column label={t('inApp')} amount={expense.amount} currency={expense.currency} date={expense.occurredOn} caption={expense.description} />
        <Column label={t('onCard')} amount={movement.amount} currency={movement.currency} date={movement.occurredOn} caption={movement.description} />
      </div>

      {Math.abs(difference) > 0.009 && (
        <p className="mt-3 text-[13px] text-ink-secondary">
          {t('difference')}:{' '}
          <span className={difference > 0 ? 'font-semibold text-expense' : 'font-semibold text-income'}>
            {difference > 0 ? '+' : '−'}
            {formatCurrency(Math.abs(difference), movement.currency)}
          </span>
        </p>
      )}

      {showDetail && (
        <div className="mt-3 space-y-1 rounded-xl bg-surface p-3 text-[13px] text-ink-tertiary">
          <p>
            {t('matchScoreBreakdown')
              .replace('{d}', String(score.description))
              .replace('{t}', String(score.date))
              .replace('{a}', String(score.amount))}
          </p>
          {suggestion.reason && <p className="text-ink-secondary">{suggestion.reason}</p>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onAccept()}>
          <Check className="mr-1 h-4 w-4" />
          {t('reconcileAction')}
        </Button>
        {Math.abs(difference) > 0.009 && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAccept({ adoptCardAmount: true })}
          >
            {t('useCardAmount')}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
          <X className="mr-1 h-4 w-4" />
          {t('rejectAction')}
        </Button>
      </div>
    </div>
  );
}

function Column({
  label,
  amount,
  currency,
  date,
  caption,
}: {
  label: string;
  amount: number;
  currency: string;
  date: string;
  caption: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">{label}</p>
      <p className="truncate text-[17px] font-semibold text-ink">{formatCurrency(amount, currency)}</p>
      <p className="text-[13px] text-ink-tertiary">{formatDate(date)}</p>
      <p className="truncate text-[12px] text-ink-tertiary" title={caption}>{caption}</p>
    </div>
  );
}
