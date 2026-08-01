import {
  BarChart,
  Bar,
  XAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { CATEGORY_COLORS } from '@/domain/categories';
import { chartFill } from '@/lib/color';
import { formatCurrency } from '@/lib/format';
import { AnimatedSegment } from './AnimatedSegment';

export type ChartView = 'pie' | 'bar';

interface Slice {
  name: string;
  value: number;
}

interface CategoryChartProps {
  view: ChartView;
  onViewChange: (view: ChartView) => void;
  byCategory: Slice[];
  overTime: Slice[];
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-[14px] text-ink-tertiary">
      {text}
    </div>
  );
}

/**
 * Spend by category, small on purpose.
 *
 * This was a full-bleed 320px chart with a grid and a legend — the loudest
 * thing on the screen, saying less than the ranked list beneath it.
 */
export function CategoryChart({ view, onViewChange, byCategory, overTime }: CategoryChartProps) {
  const { t } = useLanguage();
  const categoryLabel = useCategoryLabel();

  return (
        <section className="space-y-3">
          {/* Stacked, not side by side: "Desglose por Categoría" next to
              "Pastel/Barras" truncates both at 390px. */}
          <h2 className="text-[15px] font-semibold text-ink">{t('categoryBreakdown')}</h2>
          <AnimatedSegment
            options={[
              { value: 'pie' as const, label: t('pie') },
              { value: 'bar' as const, label: t('bar') },
            ]}
            value={view}
            onChange={onViewChange}
            ariaLabel={t('visualizations')}
          />

          {/* Deliberately small: a full-bleed 320px chart is the loudest thing
              on the screen and says less than the list beneath it. */}
          <div className="h-[200px]">
            {view === 'pie' ? (
              byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {byCategory.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={chartFill(CATEGORY_COLORS[entry.name] || '#64748b')}
                        />
                      ))}
                    </Pie>
                    {/* A pie tooltip takes its label from the slice name, so
                        without this it shows the raw category slug. */}
                    <RechartsTooltip
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        categoryLabel(name),
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty text={t('noExpenses')} />
              )
            ) : overTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overTime} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(var(--ink-tertiary))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" fill="hsl(var(--ink))" fillOpacity={0.75} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty text={t('noData')} />
            )}
          </div>

          {view === 'pie' && byCategory.length > 0 && (
            <ul className="space-y-1.5">
              {byCategory.slice(0, 5).map((entry) => (
                <li key={entry.name} className="flex items-center gap-2.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: chartFill(CATEGORY_COLORS[entry.name] || '#64748b') }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink-secondary">
                    {categoryLabel(entry.name)}
                  </span>
                  <span className="tnum shrink-0 text-[14px] font-medium text-ink">
                    {formatCurrency(entry.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
  );
}
