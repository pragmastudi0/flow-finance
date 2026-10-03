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
  /** When set, the month label opens a native month picker to jump anywhere. */
  onPickMonth?: (month: Date) => void;
}

export function MonthSelector({
  month,
  direction,
  isCurrentMonth,
  onPrev,
  onNext,
  onToday,
  onPickMonth,
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

        {/* Transparent native picker over the label — tapping the month name
            opens iOS's month wheel, so you can jump without tapping the arrows
            twelve times. No separate control, so nothing extra to style. */}
        {onPickMonth && (
          <input
            type="month"
            value={format(month, 'yyyy-MM')}
            aria-label={es_ ? 'Elegir mes' : 'Pick month'}
            onChange={(event) => {
              if (!event.target.value) return;
              onPickMonth(new Date(`${event.target.value}-01T12:00:00`));
            }}
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />
        )}
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
          disabled={isCurrentMonth}
          aria-label={es_ ? 'Mes siguiente' : 'Next month'}
          className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-tertiary transition-colors hover:text-ink active:bg-surface-muted disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
