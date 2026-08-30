import { Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import { merchantLabel } from '@/domain/reconciliation/normalize';
import type { ConfirmedMatch } from '@/services/reconciliation';

interface Props {
  match: ConfirmedMatch;
  onUndo: () => void;
  busy?: boolean;
}

/**
 * A settled pair. Both sides stay visible — the point of the group is being
 * able to check what was accepted, and take it back if it was wrong.
 */
export function ConfirmedRow({ match, onUndo, busy }: Props) {
  const { t } = useLanguage();
  const { movement, transaction } = match;

  return (
    <div className="flex items-center gap-3 px-4 py-3 [&+*]:border-t [&+*]:border-hairline">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-income/15 text-[13px] font-bold text-income">
        ✓
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">
          {transaction?.description || merchantLabel(movement.description)}
        </p>
        <p className="truncate text-[13px] text-ink-tertiary">
          {formatDate(movement.occurredOn)} · {movement.description}
        </p>
      </div>
      <span className="shrink-0 text-[15px] font-semibold text-ink">
        {formatCurrency(movement.amount, movement.currency)}
      </span>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo} aria-label={t('undo')}>
        <Undo2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
