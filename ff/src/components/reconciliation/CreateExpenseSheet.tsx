import { useEffect, useState } from 'react';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useCategoryOptions } from '@/hooks/useCategoryOptions';
import { useCategoryLearnings } from '@/hooks/useCategories';
import { guessCategory } from '@/domain/parser';
import { merchantLabel } from '@/domain/reconciliation/normalize';
import type { BankMovement } from '@/domain/reconciliation/types';
import type { TransactionInput } from '@/lib/mappers';

interface Props {
  movement: BankMovement | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: TransactionInput) => Promise<void>;
}

/**
 * Register a movement the app did not have.
 *
 * Everything is pre-filled from the statement — date, amount, currency,
 * cleaned-up merchant name — and the category comes from the same
 * `guessCategory` the chat entry and the receipt scanner use, learnings
 * included. The user still confirms: the sheet suggests, it does not save on
 * its own.
 */
export function CreateExpenseSheet({ movement, onOpenChange, onConfirm }: Props) {
  const { t, language } = useLanguage();
  const { options } = useCategoryOptions('expense');
  const { data: learnings = [] } = useCategoryLearnings();

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!movement) return;
    const label = merchantLabel(movement.description);
    setDescription(label);
    setAmount(movement.amount);
    setDate(movement.occurredOn);
    setCategory(
      guessCategory(
        `${label} ${movement.description}`,
        'expense',
        learnings.map((l) => ({ keyword: l.keyword, category: l.category, type: l.type })),
        options.filter((o) => o.custom).map((o) => o.value),
      ),
    );
  }, [movement, learnings, options]);

  if (!movement) return null;

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({
        type: 'expense',
        amount,
        currency: movement.currency,
        // The statement is already in the currency it charged; no conversion
        // is invented here.
        fxRate: 1,
        category,
        description,
        occurredOn: date,
        rawInput: `[Resumen ${movement.cardLast4 ?? ''}] ${movement.description}`.trim(),
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open onOpenChange={onOpenChange} title={t('createExpense')}>
      <div className="space-y-4 px-5 pb-6">
        <div>
          <Label htmlFor="rec-description">{t('description')}</Label>
          <Input
            id="rec-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="mt-1 text-[12px] text-ink-tertiary">{movement.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="rec-amount">{t('amount')}</Label>
            <Input
              id="rec-amount"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="rec-date">{t('date')}</Label>
            <Input id="rec-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>{t('category')}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.icon} {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          className="w-full"
          loading={saving}
          disabled={saving || !description.trim() || amount <= 0 || !date}
          onClick={handleConfirm}
        >
          {language === 'es' ? 'Crear gasto' : 'Create expense'}
        </Button>
      </div>
    </BottomSheet>
  );
}
