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
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto flex max-w-2xl items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
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

        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholders[placeholderIndex]}
            disabled={loading}
            className="flex h-12 w-full rounded-2xl border border-input bg-muted/50 px-4 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors',
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
