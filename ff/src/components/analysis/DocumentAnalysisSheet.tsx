import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
import { formatCurrency, formatDate } from '@/lib/format';
import { CATEGORY_ICONS, categoriesFor } from '@/domain/categories';
import type { AnalyzedDocument } from '@/lib/receipts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extraction: AnalyzedDocument | null;
  previewUrl?: string | null;
  onConfirm: (data: {
    amount: number;
    currency: 'ARS' | 'USD';
    fxRate: number;
    type: 'expense' | 'income';
    category: string;
    description: string;
    occurredOn: string;
  }) => Promise<void>;
  loading?: boolean;
}

export function DocumentAnalysisSheet({
  open, onOpenChange, extraction, previewUrl, onConfirm, loading,
}: Props) {
  const { t, language } = useLanguage();
  const categoryLabel = useCategoryLabel();

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState('');

  function defaultDescription(e: AnalyzedDocument): string {
    const items = e.items.map(i => i.description.trim()).filter(Boolean);
    const summary = items.length > 0
      ? items.slice(0, 4).join(', ') + (items.length > 4 ? ` y ${items.length - 4} más` : '')
      : '';
    return e.merchant
      ? summary ? `${e.merchant}: ${summary}` : e.merchant
      : summary || '';
  }

  useEffect(() => {
    if (extraction) {
      setDescription(defaultDescription(extraction));
      setCategory(categoriesFor('expense')[0] ?? 'other');
      setAmount(extraction.total);
      setDate(extraction.date ?? '');
    }
  }, [extraction]);

  if (!extraction) return null;

  const handleConfirm = async () => {
    await onConfirm({
      amount, currency: extraction.currency, fxRate: 1,
      type: 'expense', category, description, occurredOn: date,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t('extractionResult')}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {previewUrl && (
            <div className="overflow-hidden rounded-lg border">
              <img src={previewUrl} alt="" className="max-h-36 w-full object-contain" />
            </div>
          )}

          <Badge className={extraction.confidence >= 0.7 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
            {Math.round(extraction.confidence * 100)}%
          </Badge>

          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('totalLabel')}</span>
              <span className="font-bold text-lg">{formatCurrency(extraction.total, extraction.currency)}</span>
            </div>
            {extraction.merchant && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('merchant')}</span>
                <span>{extraction.merchant}</span>
              </div>
            )}
            {extraction.date && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('date')}</span>
                <span>{formatDate(extraction.date)}</span>
              </div>
            )}
          </div>

          {extraction.items.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t('lineItems')}</h4>
                <div className="space-y-1">
                  {extraction.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="truncate">{item.description}</span>
                      {item.totalPrice != null && (
                        <span className="shrink-0 font-medium tabular-nums">
                          {formatCurrency(item.totalPrice, extraction.currency)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">
              {language === 'es' ? 'Editar antes de guardar' : 'Edit before saving'}
            </h4>

            <div className="space-y-1.5">
              <Label htmlFor="desc">{t('description')}</Label>
              <Input id="desc" value={description} onChange={e => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat">{t('category')}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categoriesFor('expense').map(cat => (
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
              <Label htmlFor="amt">{t('amount')}</Label>
              <Input id="amt" type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dt">{t('date')}</Label>
              <Input id="dt" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <Button className="w-full" onClick={handleConfirm} loading={loading}>
            {t('save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
