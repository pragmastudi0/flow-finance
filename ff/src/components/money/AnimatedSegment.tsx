import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface AnimatedSegmentProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

/**
 * iOS-style segmented control: a recessed track with a single raised thumb
 * that slides between options.
 *
 * The thumb is a `layoutId` element, so framer moves it for us. That id is
 * derived from `useId()` rather than a literal — two segments mounted at once
 * (Home and Reports during a route transition) sharing one id would make the
 * thumb fly across the screen between them.
 */
export function AnimatedSegment<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: AnimatedSegmentProps<T>) {
  const thumbId = `segment-thumb-${useId()}`;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex w-full items-center gap-0.5 rounded-full bg-surface-muted p-0.5"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className="relative min-w-0 flex-1 rounded-full px-3 py-2"
          >
            {active && (
              <motion.span
                layoutId={thumbId}
                transition={SPRING}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.08)]"
              />
            )}
            <span
              className={cn(
                'relative block truncate text-[13px] font-medium transition-colors',
                active ? 'text-ink' : 'text-ink-secondary',
              )}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
