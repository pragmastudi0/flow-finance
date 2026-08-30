import { EyeOff, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { BankMovement } from '@/domain/reconciliation/types';

const KIND_LABEL: Record<string, string> = {
  installment: 'Cuota',
  tax: 'Impuesto',
  fee: 'Comisión',
  interest: 'Interés',
  cash_advance: 'Adelanto',
  refund: 'Devolución',
  payment: 'Pago',
  adjustment: 'Ajuste',
};

interface Props {
  movement: BankMovement;
  onCreate?: () => void;
  onIgnore?: () => void;
  busy?: boolean;
}

/**
 * A statement movement with no counterpart in the app — "found on the card,
 * never registered". The primary action creates the expense from it; the
 * secondary one sets it aside for the lines that are not expenses to track.
 */
export function MovementRow({ movement, onCreate, onIgnore, busy }: Props) {
  const { t } = useLanguage();
  const kind = KIND_LABEL[movement.kind];

  return (
    <div className="flex items-center gap-3 px-4 py-3 [&+*]:border-t [&+*]:border-hairline">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-ink">{movement.description}</p>
        <p className="text-[13px] text-ink-tertiary">
          {formatDate(movement.occurredOn)}
          {movement.installmentTotal
            ? ` · ${movement.installmentCurrent}/${movement.installmentTotal}`
            : kind
              ? ` · ${kind}`
              : ''}
        </p>
      </div>
      <span className="shrink-0 text-[15px] font-semibold text-ink">
        {formatCurrency(movement.amount, movement.currency)}
      </span>
      {onCreate && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={onCreate} aria-label={t('createExpense')}>
          <Plus className="h-4 w-4" />
        </Button>
      )}
      {onIgnore && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={onIgnore} aria-label={t('ignoreMovement')}>
          <EyeOff className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
