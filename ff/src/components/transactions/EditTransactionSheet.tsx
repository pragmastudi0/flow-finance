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
import { useLanguage } from '@/i18n/LanguageProvider';
import { useCategoryOptions } from '@/hooks/useCategoryOptions';
import { PAYMENT_METHODS, type PaymentMethod, type Transaction } from '@/types/models';

/** `null` cannot be a Radix Select value, so "unset" gets its own sentinel. */
const UNSET = '__unset__';

const PAYMENT_LABEL = {
  cash: 'paymentCash',
  transfer: 'paymentTransfer',
  debit: 'paymentDebit',
  credit: 'paymentCredit',
  other: 'paymentOther',
} as const;

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

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>(UNSET);

  const { options: categoryOptions } = useCategoryOptions(type);

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setAmount(transaction.amount);
      setCurrency(transaction.currency as 'ARS' | 'USD');
      setCategory(transaction.category);
      setDescription(transaction.description);
      setDate(transaction.occurredOn);
      setPaymentMethod(transaction.paymentMethod ?? UNSET);
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
      paymentMethod: paymentMethod === UNSET ? null : (paymentMethod as PaymentMethod),
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
                {categoryOptions.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Only expenses can appear on a card statement, so income has no
              method to record. */}
          {type === 'expense' && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-payment">{t('paymentMethod')}</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="edit-payment"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>{t('paymentUnset')}</SelectItem>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(PAYMENT_LABEL[method])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

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
