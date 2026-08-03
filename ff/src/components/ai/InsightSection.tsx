import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

interface InsightSectionProps {
  icon: LucideIcon;
  title: string;
  /** Staggers the entrance so the cards arrive in reading order. */
  index?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * One block of the report. Every section on the screen is this, so they can't
 * drift apart in spacing or weight.
 */
export function InsightSection({
  icon: Icon,
  title,
  index = 0,
  children,
  className,
}: InsightSectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: Math.min(index, 6) * 0.06 }}
      className={cn('space-y-3', className)}
    >
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon className="h-[17px] w-[17px] shrink-0 text-ink-tertiary" />
        {title}
      </h2>
      {children}
    </motion.section>
  );
}

/** A plain bulleted list, hairline-separated rather than boxed. */
export function InsightList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-ink-secondary">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-tertiary" />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered, for the three priority actions. */
export function InsightSteps({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5 text-[14px] leading-relaxed text-ink-secondary">
            {item}
          </span>
        </li>
      ))}
    </ol>
  );
}
