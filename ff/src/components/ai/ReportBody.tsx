import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Lightbulb,
  ListChecks,
  Minus,
  PiggyBank,
  TrendingUp,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { formatCurrency } from '@/lib/format';
import { ScoreRing } from './ScoreRing';
import { InsightList, InsightSection, InsightSteps } from './InsightSection';
import type { AiReport } from '@/services/ai';

/**
 * The report itself.
 *
 * Split from the page so the page stays about loading, errors and actions —
 * and so the thing the print stylesheet lays out is one component.
 */
export function ReportBody({ report }: { report: AiReport }) {
  const { language } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const es = language === 'es';

  const comparisonIcon =
    report.monthComparison.direction === 'up'
      ? ArrowUpRight
      : report.monthComparison.direction === 'down'
        ? ArrowDownRight
        : Minus;

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-surface-muted/60 px-5 py-6"
    >
      <ScoreRing score={report.score} health={report.health} />
    </motion.div>

    <InsightSection icon={FileText} title={es ? 'Resumen del mes' : 'Month summary'} index={0}>
      <p className="text-[15px] leading-relaxed text-ink-secondary">{report.summary}</p>
    </InsightSection>

    {report.topCategories.length > 0 && (
      <InsightSection
        icon={TrendingUp}
        title={es ? 'Dónde más gastás' : 'Where you spend most'}
        index={1}
      >
        <ul>
          {report.topCategories.map((c) => (
            <li
              key={c.category}
              className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">
                  {categoryLabel(c.category)}
                </p>
                {c.note && (
                  <p className="text-[13px] leading-snug text-ink-tertiary">{c.note}</p>
                )}
              </div>
              <span className="tnum shrink-0 text-[14px] font-semibold text-ink">
                {formatCurrency(c.amount)}
              </span>
            </li>
          ))}
        </ul>
      </InsightSection>
    )}

    <InsightSection
      icon={comparisonIcon}
      title={es ? 'Contra el mes anterior' : 'Versus last month'}
      index={2}
    >
      <p className="text-[15px] leading-relaxed text-ink-secondary">
        {report.monthComparison.note}
      </p>
      {report.keyChanges.length > 0 && (
        <div className="pt-1">
          <InsightList items={report.keyChanges} />
        </div>
      )}
    </InsightSection>

    {report.savingsOpportunities.length > 0 && (
      <InsightSection
        icon={PiggyBank}
        title={es ? 'Oportunidades de ahorro' : 'Savings opportunities'}
        index={3}
      >
        <ul className="space-y-3">
          {report.savingsOpportunities.map((o) => (
            <li key={o.title} className="rounded-2xl bg-surface-muted/60 px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-[14px] font-medium text-ink">{o.title}</p>
                {o.estimatedMonthlySaving != null && (
                  <span className="tnum shrink-0 text-[14px] font-semibold text-income">
                    {formatCurrency(o.estimatedMonthlySaving)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">{o.detail}</p>
            </li>
          ))}
        </ul>
      </InsightSection>
    )}

    {report.suspiciousExpenses.length > 0 && (
      <InsightSection
        icon={AlertTriangle}
        title={es ? 'Riesgos detectados' : 'Detected risks'}
        index={4}
      >
        <ul className="space-y-2.5">
          {report.suspiciousExpenses.map((s) => (
            <li key={s.description} className="text-[14px] leading-relaxed">
              <span className="font-medium text-ink">{s.description}</span>
              <span className="text-ink-secondary"> — {s.reason}</span>
            </li>
          ))}
        </ul>
      </InsightSection>
    )}

    <InsightSection
      icon={TrendingUp}
      title={es ? 'Proyección a fin de mes' : 'End-of-month projection'}
      index={5}
    >
      {(report.projection.projectedExpenses != null ||
        report.projection.projectedBalance != null) && (
        <div className="flex gap-6 pb-1">
          {report.projection.projectedExpenses != null && (
            <div>
              <p className="text-[12px] text-ink-tertiary">
                {es ? 'Gastos proyectados' : 'Projected expenses'}
              </p>
              <p className="tnum mt-0.5 text-[17px] font-semibold text-expense">
                {formatCurrency(report.projection.projectedExpenses)}
              </p>
            </div>
          )}
          {report.projection.projectedBalance != null && (
            <div>
              <p className="text-[12px] text-ink-tertiary">
                {es ? 'Balance proyectado' : 'Projected balance'}
              </p>
              <p
                className={cn(
                  'tnum mt-0.5 text-[17px] font-semibold',
                  report.projection.projectedBalance < 0 ? 'text-expense' : 'text-income',
                )}
              >
                {formatCurrency(report.projection.projectedBalance)}
              </p>
            </div>
          )}
        </div>
      )}
      <p className="text-[15px] leading-relaxed text-ink-secondary">
        {report.projection.note}
      </p>
    </InsightSection>

    {report.recommendations.length > 0 && (
      <InsightSection
        icon={Lightbulb}
        title={es ? 'Recomendaciones' : 'Recommendations'}
        index={6}
      >
        <InsightList items={report.recommendations} />
      </InsightSection>
    )}

    {report.priorityActions.length > 0 && (
      <InsightSection
        icon={ListChecks}
        title={es ? 'Tres acciones prioritarias' : 'Three priority actions'}
        index={6}
      >
        <InsightSteps items={report.priorityActions} />
      </InsightSection>
    )}

    {report.missingData.length > 0 && (
      <InsightSection
        icon={AlertTriangle}
        title={es ? 'Datos que faltan' : 'Missing data'}
        index={6}
      >
        <InsightList items={report.missingData} />
      </InsightSection>
    )}
    </>
  );
}
