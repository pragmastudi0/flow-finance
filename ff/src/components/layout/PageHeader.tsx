import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageProvider';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Route to go back to. Omit on top-level tabs. */
  back?: string;
  /** Trailing control, e.g. an export or add button. */
  action?: React.ReactNode;
}

/**
 * Title block for secondary screens. The back affordance is a chevron with no
 * chrome around it — a bordered button here reads as a form control.
 */
export function PageHeader({ title, subtitle, back, action }: PageHeaderProps) {
  const { language } = useLanguage();

  return (
    <header className="flex items-start gap-1 pb-6 pt-4">
      {back && (
        <Link
          to={back}
          aria-label={language === 'es' ? 'Volver' : 'Back'}
          className="-ml-2 flex h-11 w-9 shrink-0 items-center justify-center text-ink-tertiary transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-6 w-6" />
        </Link>
      )}
      <div className="min-w-0 flex-1 pt-1.5">
        <h1 className="truncate text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-[15px] leading-snug text-ink-tertiary">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}
