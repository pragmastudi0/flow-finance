import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ListGroupProps {
  /** Small caption above the group, as in iOS Settings. */
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * An inset grouped list.
 *
 * The secondary screens were a stack of bordered Cards, one per setting, each
 * with its own "Configure" button — a lot of chrome for what is really a list
 * of links. One rounded container with hairline-separated rows says the same
 * thing far more quietly.
 */
export function ListGroup({ title, children, className }: ListGroupProps) {
  return (
    <section className={cn('space-y-2', className)}>
      {title && (
        <h2 className="px-4 text-[13px] font-medium text-ink-tertiary">{title}</h2>
      )}
      <div className="overflow-hidden rounded-2xl bg-surface-muted/60">{children}</div>
    </section>
  );
}

interface ListRowProps {
  icon?: LucideIcon;
  label: string;
  description?: string;
  /** Trailing text, e.g. the current value. */
  value?: string;
  /** Makes the row a link with a chevron. */
  to?: string;
  onClick?: () => void;
  /** Renders the label in the expense colour, for sign-out and the like. */
  destructive?: boolean;
  /** Replaces the chevron, e.g. with a segmented control. */
  trailing?: React.ReactNode;
}

export function ListRow({
  icon: Icon,
  label,
  description,
  value,
  to,
  onClick,
  destructive,
  trailing,
}: ListRowProps) {
  const interactive = !!to || !!onClick;

  const body = (
    <>
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-ink-secondary">
          <Icon className="h-[17px] w-[17px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[15px] font-medium',
            destructive ? 'text-expense' : 'text-ink',
          )}
        >
          {label}
        </span>
        {description && (
          <span className="block truncate text-[13px] text-ink-tertiary">{description}</span>
        )}
      </span>
      {value && <span className="shrink-0 text-[15px] text-ink-tertiary">{value}</span>}
      {trailing}
      {/* A chevron promises navigation; sign-out and the like act in place. */}
      {interactive && !trailing && !destructive && (
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
      )}
    </>
  );

  const className =
    'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors [&+*]:border-t [&+*]:border-hairline';

  if (to) {
    return (
      <Link to={to} className={cn(className, 'active:bg-hairline/50')}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(className, 'active:bg-hairline/50')}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
