import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { useLanguage } from '@/i18n/LanguageProvider';
import { EASE_IOS } from '@/lib/motion';

interface MonthSelectorProps {
  month: Date;
  /** Which way the last change went, so the label slides to match. */
  direction: 1 | -1;
  isCurrentMonth: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function MonthSelector({
  month,
  direction,
  isCurrentMonth,
  onPrev,
  onNext,
  onToday,
}: MonthSelectorProps) {
  const { language } = useLanguage();
  const es_ = language === 'es';
  const locale = es_ ? es : enUS;

  // Without an explicit locale date-fns falls back to English ("July De 2026").
  const label = format(month, 'MMMM yyyy', { locale });
  const key = `${month.getFullYear()}-${month.getMonth()}`;

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        aria-label={es_ ? 'Mes anterior' : 'Previous month'}
        className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-tertiary transition-colors hover:text-ink active:bg-surface-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="relative flex h-6 min-w-0 flex-1 items-center justify-center overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.span
            key={key}
            custom={direction}
            initial={{ opacity: 0, x: direction * 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -18 }}
            transition={EASE_IOS}
            /* `capitalize` would also uppercase the "de" in "julio de 2026". */
            className="truncate text-[15px] font-semibold text-ink first-letter:uppercase"
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="flex items-center">
        <AnimatePresence initial={false}>
          {!isCurrentMonth && (
            <motion.button
              type="button"
              onClick={onToday}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={EASE_IOS}
              className="overflow-hidden whitespace-nowrap text-[13px] font-medium text-ink-secondary hover:text-ink"
            >
              {es_ ? 'Hoy' : 'Today'}
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={onNext}
          aria-label={es_ ? 'Mes siguiente' : 'Next month'}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-tertiary transition-colors hover:text-ink active:bg-surface-muted"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
