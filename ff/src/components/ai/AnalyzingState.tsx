import { motion } from 'framer-motion';
import { useLanguage } from '@/i18n/LanguageProvider';

/** Indeterminate: the model gives no progress signal, so a percentage would be a lie. */
function IndeterminateBar() {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
      <motion.div
        className="h-full w-1/3 rounded-full bg-ink"
        animate={{ x: ['-100%', '300%'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

/** Shown while a fresh analysis is being generated. */
export function AnalyzingState() {
  const { language } = useLanguage();
  const es = language === 'es';

  return (
    <div className="space-y-8 py-4">
      <div className="space-y-3">
        <p className="text-[15px] font-medium text-ink">
          {es ? 'Analizando tus finanzas…' : 'Analysing your finances…'}
        </p>
        <IndeterminateBar />
        <p className="text-[13px] text-ink-tertiary">
          {es
            ? 'Esto puede tardar unos segundos.'
            : 'This may take a few seconds.'}
        </p>
      </div>
      <ReportSkeleton />
    </div>
  );
}

const Line = ({ w }: { w: string }) => (
  <div className={`h-3 rounded bg-surface-muted ${w}`} />
);

/** Matches the real layout closely enough that nothing jumps when it swaps in. */
export function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-8" aria-hidden>
      <div className="flex items-center gap-6">
        <div className="h-[132px] w-[132px] shrink-0 rounded-full bg-surface-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <Line w="w-24" />
          <div className="h-6 w-32 rounded bg-surface-muted" />
        </div>
      </div>

      <div className="space-y-3">
        <Line w="w-32" />
        <div className="space-y-2">
          <Line w="w-full" />
          <Line w="w-11/12" />
          <Line w="w-3/4" />
        </div>
      </div>

      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Line w="w-40" />
          <div className="space-y-2">
            <Line w="w-full" />
            <Line w="w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}
