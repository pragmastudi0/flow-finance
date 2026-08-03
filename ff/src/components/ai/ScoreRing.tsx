import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { FinancialHealth } from '@/services/ai';

interface ScoreRingProps {
  score: number;
  health: FinancialHealth;
}

const HEALTH_LABEL: Record<FinancialHealth, { es: string; en: string }> = {
  excellent: { es: 'Excelente', en: 'Excellent' },
  good: { es: 'Buena', en: 'Good' },
  fair: { es: 'Regular', en: 'Fair' },
  poor: { es: 'Frágil', en: 'Poor' },
};

const SIZE = 132;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The score, as a ring rather than a bar.
 *
 * Colour follows the same two-money-colour rule as the rest of the app: a
 * healthy score is income green, a poor one is expense red, and everything
 * between is ink. No third hue, no traffic-light gradient.
 */
export function ScoreRing({ score, health }: ScoreRingProps) {
  const { language } = useLanguage();
  const clamped = Math.max(0, Math.min(100, score));
  const tone =
    health === 'excellent' || health === 'good'
      ? 'text-income'
      : health === 'poor'
        ? 'text-expense'
        : 'text-ink';

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            className="stroke-hairline"
          />
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className={cn('stroke-current', tone)}
            strokeDasharray={CIRCUMFERENCE}
            initial={{ strokeDashoffset: CIRCUMFERENCE }}
            animate={{ strokeDashoffset: CIRCUMFERENCE * (1 - clamped / 100) }}
            transition={{ duration: 1.1, ease: [0.32, 0.72, 0, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn('tnum text-[38px] font-bold leading-none tracking-[-0.03em]', tone)}
          >
            {clamped}
          </motion.span>
          <span className="mt-1 text-[11px] font-medium text-ink-tertiary">/ 100</span>
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink-tertiary">
          {language === 'es' ? 'Salud financiera' : 'Financial health'}
        </p>
        <p className={cn('mt-0.5 text-[22px] font-bold tracking-[-0.02em]', tone)}>
          {HEALTH_LABEL[health][language === 'es' ? 'es' : 'en']}
        </p>
      </div>
    </div>
  );
}
