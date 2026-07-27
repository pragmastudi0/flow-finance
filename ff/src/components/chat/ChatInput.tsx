import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';

interface ChatInputProps {
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  loading?: boolean;
}

export function ChatInput({ onSend, onUpload, loading }: ChatInputProps) {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const placeholders = [...t('placeholdersExpense'), ...t('placeholdersIncome')];

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholders.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [placeholders.length]);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text || loading) return;
    onSend(text);
    setValue('');
    inputRef.current?.focus();
  }, [value, loading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="sticky bottom-0 z-20 border-t bg-background/95 px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-3">
      <div className="mx-auto flex max-w-2xl items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50 sm:h-12 sm:w-12"
          aria-label="Subir comprobante"
        >
          <Camera className="h-5 w-5" />
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 16px text on mobile: anything smaller makes iOS Safari zoom the page
            on focus, and the layout never recovers. */}
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[placeholderIndex]}
            disabled={loading}
            className="flex h-11 w-full rounded-2xl border border-input bg-muted/50 px-4 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 sm:h-12 sm:text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors sm:h-12 sm:w-12',
            value.trim() && !loading
              ? 'bg-primary hover:bg-primary/90'
              : 'bg-muted-foreground/30',
          )}
          aria-label="Enviar"
        >
          <SendHorizonal className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
