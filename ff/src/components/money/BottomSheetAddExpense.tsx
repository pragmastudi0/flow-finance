import { useEffect, useRef, useState } from 'react';
import { Camera, SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { AnimatedSegment } from './AnimatedSegment';
import { PendingTransactionCard } from './PendingTransactionCard';
import type { ParsedTransaction } from '@/domain/parser';
import type { TxType } from '@/domain/categories';

interface BottomSheetAddExpenseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: TxType;
  onTypeChange: (type: TxType) => void;
  /** Runs the natural-language parser. Returns false when nothing was understood. */
  onParse: (text: string) => boolean;
  pending: ParsedTransaction | null;
  onConfirm: () => void;
  onCancelPending: () => void;
  onUpload: (file: File) => void;
  saving?: boolean;
}

/**
 * The whole add flow in one surface: pick expense or income, type it in plain
 * language (or shoot a receipt), then confirm what the parser understood.
 */
export function BottomSheetAddExpense({
  open,
  onOpenChange,
  type,
  onTypeChange,
  onParse,
  pending,
  onConfirm,
  onCancelPending,
  onUpload,
  saving,
}: BottomSheetAddExpenseProps) {
  const { t, language } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const placeholders = type === 'expense' ? t('placeholdersExpense') : t('placeholdersIncome');

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [open, placeholders.length]);

  // A sheet that reopens holding the last attempt feels broken.
  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const submit = () => {
    const text = value.trim();
    if (!text || saving) return;
    if (onParse(text)) setValue('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('addTransaction')}
    >
      <AnimatedSegment
        options={[
          { value: 'expense' as const, label: t('expenses') },
          { value: 'income' as const, label: t('income') },
        ]}
        value={type}
        onChange={(next) => {
          onTypeChange(next);
          onCancelPending();
        }}
        ariaLabel={t('type')}
      />

      {pending ? (
        <div className="pt-4">
          <PendingTransactionCard
            parsed={pending}
            onConfirm={onConfirm}
            onCancel={onCancelPending}
            loading={saving}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={language === 'es' ? 'Subir comprobante' : 'Upload receipt'}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-secondary transition-colors hover:text-ink"
          >
            <Camera className="h-5 w-5" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* 17px at every breakpoint: a `sm:` step down to 14px still trips
              iOS focus-zoom on an iPad in landscape. */}
          <input
            ref={inputRef}
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={placeholders[placeholderIndex]}
            className="h-12 w-full rounded-full bg-surface-muted px-4 text-[17px] text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-ink/10"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || saving}
            aria-label={language === 'es' ? 'Guardar' : 'Save'}
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors',
              value.trim() && !saving ? 'bg-ink' : 'bg-ink-tertiary/40',
            )}
          >
            <SendHorizonal className="h-5 w-5" />
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
