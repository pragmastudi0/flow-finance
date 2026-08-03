import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { House, ChartPie, Sparkles, PiggyBank, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { ROUTES } from '@/lib/routes';
import { SPRING } from '@/lib/motion';

const NAV_ITEMS = [
  { path: ROUTES.home, labelKey: 'navHome' as const, icon: House },
  { path: ROUTES.reports, labelKey: 'navReports' as const, icon: ChartPie },
  { path: ROUTES.aiInsights, labelKey: 'navAi' as const, icon: Sparkles },
  { path: ROUTES.savings, labelKey: 'navSavings' as const, icon: PiggyBank },
  { path: ROUTES.settings, labelKey: 'navSettings' as const, icon: Settings },
] as const;

/**
 * Floating tab bar.
 *
 * It is `fixed`, so unlike the old in-flow bar it reserves no space — pages
 * clear it with the `.pb-nav` utility (applied by PageShell). The outer nav is
 * click-through so the blur strip doesn't eat taps on content beside the pill.
 */
export function NavBar() {
  const { t } = useLanguage();
  const location = useLocation();

  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-5"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + var(--nav-gap))' }}
    >
      <div className="pointer-events-auto mx-auto flex h-[var(--nav-h)] max-w-sm items-center gap-1 rounded-full border border-hairline/80 bg-surface/70 px-1.5 shadow-float backdrop-blur-2xl">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className="relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-full"
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  transition={SPRING}
                  className="absolute inset-0 rounded-full bg-surface-muted"
                />
              )}
              <span
                className={cn(
                  'relative flex flex-col items-center gap-0.5 transition-colors',
                  active ? 'text-ink' : 'text-ink-tertiary',
                )}
              >
                <Icon className={cn('h-[22px] w-[22px]', active && 'stroke-[2.4]')} />
                <span className="text-[10px] font-medium leading-none">{t(labelKey)}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
