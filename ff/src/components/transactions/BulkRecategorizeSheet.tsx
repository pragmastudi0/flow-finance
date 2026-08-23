import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatCurrency, formatDate } from '@/lib/format';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { useCategoryVisuals } from '@/hooks/useCategoryOptions';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import type { SimilarMatch } from '@/domain/similar';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the selected transactions are headed. */
  toCategory: string;
  matches: SimilarMatch[];
  /** The word offered as a rule for future entries; null when there is none. */
  keyword: string | null;
  onConfirm: (ids: string[], learnKeyword: string | null) => void;
  saving?: boolean;
}

/**
 * The follow-up to a recategorization: the transactions that look like the one
 * just moved, ready to move with it.
 *
 * Everything arrives ticked — the whole point is to fix a batch in one gesture,
 * and the matched word is shown on every row so an unwanted one is obvious at a
 * glance and one tap away from being left alone.
 */
export function BulkRecategorizeSheet({
  open,
  onOpenChange,
  toCategory,
  matches,
  keyword,
  onConfirm,
  saving,
}: Props) {
  const { t } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const { iconOf, colorOf } = useCategoryVisuals();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [learn, setLearn] = useState(true);

  // A fresh batch starts fully ticked; reopening must not inherit the last one.
  useEffect(() => {
    if (open) {
      setSelected(new Set(matches.map((m) => m.transaction.id)));
      setLearn(true);
    }
  }, [open, matches]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const count = selected.size;
  const destinationLabel = categoryLabel(toCategory);

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={t('similarFound')}>
      <p className="text-[15px] text-ink-secondary">{t('similarFoundHint')}</p>

      <ul className="mt-4 space-y-1.5">
        {matches.map(({ transaction, sharedTokens }) => {
          const isSelected = selected.has(transaction.id);
          return (
            <li key={transaction.id}>
              <button
                type="button"
                onClick={() => toggle(transaction.id)}
                aria-pressed={isSelected}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-ink/15 bg-surface-muted'
                    : 'border-hairline bg-transparent opacity-60',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                    isSelected ? 'border-ink bg-ink text-white' : 'border-hairline',
                  )}
                  aria-hidden="true"
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">
                    {transaction.description || t('similarMatchedOn')}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-tertiary">
                    <span>{formatDate(transaction.occurredOn)}</span>
                    <span style={{ color: colorOf(transaction.category) }}>
                      {iconOf(transaction.category)}
                    </span>
                    <span>{categoryLabel(transaction.category)}</span>
                    {/* Why this row is here at all. */}
                    <span className="rounded bg-hairline/60 px-1.5 py-px text-ink-secondary">
                      {t('similarMatchedOn')} «{sharedTokens[0]}»
                    </span>
                  </span>
                </span>

                <span className="tnum shrink-0 text-[15px] font-medium text-ink">
                  {formatCurrency(transaction.amount, transaction.currency)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {keyword && (
        <button
          type="button"
          onClick={() => setLearn((v) => !v)}
          aria-pressed={learn}
          className="mt-4 flex w-full items-start gap-3 rounded-xl border border-hairline px-3 py-3 text-left"
        >
          <span
            className={cn(
              'mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
              learn ? 'border-ink bg-ink text-white' : 'border-hairline',
            )}
            aria-hidden="true"
          >
            {learn && <Check className="h-3.5 w-3.5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium text-ink">
              «{keyword}» → {destinationLabel}
            </span>
            <span className="mt-0.5 block text-[13px] text-ink-tertiary">
              {t('learnRuleHint')}
            </span>
          </span>
        </button>
      )}

      {/* Sticky: with a dozen matches the list is long, and the action that
          ends the flow must not sit behind all of it. */}
      <div className="sticky bottom-0 -mx-5 mt-5 space-y-2 border-t border-hairline bg-surface px-5 pb-1 pt-3">
        <Button
          className="w-full"
          disabled={count === 0}
          loading={saving}
          onClick={() => onConfirm([...selected], learn ? keyword : null)}
        >
          {t('applyToSelected')} {count}{' '}
          {count === 1 ? t('transactionWord') : t('transactionsWord')}
        </Button>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="w-full py-2 text-center text-[15px] font-medium text-ink-secondary"
        >
          {t('cancel')}
        </button>
      </div>
    </BottomSheet>
  );
}
