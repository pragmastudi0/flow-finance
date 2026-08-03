import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SendHorizonal, Sparkles } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { SPRING } from '@/lib/motion';
import type { ChatMessage } from '@/hooks/useAiInsights';
import type { AiError } from '@/services/ai';

interface AiChatSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: ChatMessage[];
  onSend: (question: string) => void;
  pending: boolean;
  error: AiError | null;
}

const SUGGESTIONS = {
  es: [
    '¿En qué gasté más?',
    '¿Cuánto puedo ahorrar este mes?',
    '¿Cómo fueron mis gastos respecto al mes pasado?',
    '¿Qué categoría debería reducir?',
  ],
  en: [
    'What did I spend most on?',
    'How much can I save this month?',
    'How does this month compare to last?',
    'Which category should I cut?',
  ],
};

function TypingDots() {
  return (
    <span className="flex gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink-tertiary"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18 }}
        />
      ))}
    </span>
  );
}

export function AiChatSheet({
  open,
  onOpenChange,
  messages,
  onSend,
  pending,
  error,
}: AiChatSheetProps) {
  const { language } = useLanguage();
  const es = language === 'es';
  const [value, setValue] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  const submit = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    onSend(q);
    setValue('');
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={es ? 'Preguntar a la IA' : 'Ask the AI'}
    >
      <div className="max-h-[52dvh] space-y-4 overflow-y-auto pb-2">
        {messages.length === 0 && !pending && (
          <div className="space-y-3">
            <p className="text-[14px] leading-relaxed text-ink-secondary">
              {es
                ? 'Preguntá lo que quieras sobre tus finanzas de este mes.'
                : 'Ask anything about this month’s finances.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS[es ? 'es' : 'en'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full bg-surface-muted px-3 py-2 text-left text-[13px] text-ink-secondary transition-colors hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed',
                m.role === 'user'
                  ? 'bg-ink text-white'
                  : 'bg-surface-muted text-ink whitespace-pre-wrap',
              )}
            >
              {m.content}
            </div>
          </motion.div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-surface-muted px-3.5 py-2.5">
              <TypingDots />
            </div>
          </div>
        )}

        {error && (
          <p className="text-[13px] text-expense">
            {error.code === 'unavailable'
              ? es
                ? 'El asistente necesita Supabase configurado.'
                : 'The assistant needs Supabase configured.'
              : es
                ? 'No pude responder. Probá de nuevo.'
                : 'Could not answer. Please try again.'}
          </p>
        )}

        <div ref={endRef} />
      </div>

      <div className="flex items-center gap-2 pt-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit(value);
            }
          }}
          placeholder={es ? 'Escribí tu pregunta…' : 'Type your question…'}
          className="h-12 w-full rounded-full bg-surface-muted px-4 text-[17px] text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-ink/10"
        />
        <button
          type="button"
          onClick={() => submit(value)}
          disabled={!value.trim() || pending}
          aria-label={es ? 'Enviar pregunta' : 'Send question'}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition-colors',
            value.trim() && !pending ? 'bg-ink' : 'bg-ink-tertiary/40',
          )}
        >
          <SendHorizonal className="h-5 w-5" />
        </button>
      </div>
    </BottomSheet>
  );
}

/** The floating entry point to the chat. */
export function AskAiButton({ onClick }: { onClick: () => void }) {
  const { language } = useLanguage();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileTap={{ scale: 0.96 }}
      transition={SPRING}
      data-print-hide
      className="bottom-nav-offset fixed right-5 z-40 flex h-14 items-center gap-2 rounded-full bg-ink px-5 text-white shadow-fab"
    >
      <Sparkles className="h-[18px] w-[18px]" />
      <span className="text-[14px] font-medium">
        {language === 'es' ? 'Preguntar a la IA' : 'Ask the AI'}
      </span>
    </motion.button>
  );
}
