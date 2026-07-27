import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useLanguage } from '@/i18n/LanguageProvider';
import { ROUTES } from '@/lib/routes';
import { House, ChartPie, PiggyBank, Settings } from 'lucide-react';

const NAV_ITEMS = [
  { path: ROUTES.home, labelKey: 'navHome' as const, icon: House },
  { path: ROUTES.reports, labelKey: 'navReports' as const, icon: ChartPie },
  { path: ROUTES.savings, labelKey: 'navSavings' as const, icon: PiggyBank },
  { path: ROUTES.settings, labelKey: 'navSettings' as const, icon: Settings },
] as const;

export function NavBar() {
  const { t } = useLanguage();
  const location = useLocation();

  return (
    <nav className="shrink-0 border-t bg-background px-2 pb-2 pt-1">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
