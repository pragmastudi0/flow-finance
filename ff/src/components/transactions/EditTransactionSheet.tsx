import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { CATEGORY_ICONS, categoriesFor } from '@/domain/categories';
import type { Transaction } from '@/types/models';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSave: (data: Partial<Transaction>) => Promise<void>;
  onDelete?: (tx: Transaction) => void;
  loading?: boolean;
}

export function EditTransactionSheet({
  open, onOpenChange, transaction, onSave, onDelete, loading,
}: Props) {
  const { t, language } = useLanguage();
  const categoryLabel = useCategoryLabel();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount);
      setCurrency(transaction.currency as 'ARS' | 'USD');
      setCategory(transaction.category);
      setDescription(transaction.description);
      setDate(transaction.occurredOn);
    }
  }, [transaction]);

  const handleSave = async () => {
    if (!transaction) return;
    await onSave({
      type,
      amount,
      currency,
      category,
      description,
      occurredOn: date,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {language === 'es' ? 'Editar transacción' : 'Edit transaction'}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label>{t('type')}</Label>
            <div className="flex gap-2">
              <Button
                variant={type === 'expense' ? 'default' : 'outline'}
                onClick={() => setType('expense')}
                className="flex-1"
              >
                {t('expenses')}
              </Button>
              <Button
                variant={type === 'income' ? 'default' : 'outline'}
                onClick={() => setType('income')}
                className="flex-1"
              >
                {t('income')}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-amt">{t('amount')}</Label>
            <Input
              id="edit-amt"
              type="number"
              step="any"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-currency">{t('currency')}</Label>
            <Select value={currency} onValueChange={(v) => setCurrency(v as 'ARS' | 'USD')}>
              <SelectTrigger id="edit-currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">ARS</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-cat">{t('category')}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="edit-cat"><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoriesFor(type).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    <span className="flex items-center gap-2">
                      <span>{CATEGORY_ICONS[cat]}</span>
                      <span>{categoryLabel(cat)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-desc">{t('description')}</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-date">{t('date')}</Label>
            <Input
              id="edit-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleSave} loading={loading}>
            {t('save')}
          </Button>

          {/* Deleting is otherwise reachable only by swiping a row, which no
              keyboard or pointer user can discover. */}
          {onDelete && transaction && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onDelete(transaction);
              }}
              className="w-full py-2 text-center text-[15px] font-medium text-expense"
            >
              {t('delete')}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
