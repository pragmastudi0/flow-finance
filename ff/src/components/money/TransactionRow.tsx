import { forwardRef, useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLanguage, useCategoryLabel } from '@/i18n/LanguageProvider';
import { CATEGORY_ICONS } from '@/domain/categories';
import { formatCurrency, formatDate } from '@/lib/format';
import { SPRING } from '@/lib/motion';
import type { Transaction } from '@/types/models';

/** Width of the revealed action zone — one 44pt target plus breathing room. */
const ACTION_W = 88;
/** Projected offset that snaps the row open instead of letting it fall back. */
const SNAP = 44;
/** Past this, releasing runs the action outright, like a full swipe in Mail. */
const COMMIT = 168;

/** Where the row will land, accounting for how fast it was thrown. */
const project = (offset: number, velocity: number) => offset + velocity * 0.08;

interface TransactionRowProps {
  tx: Transaction;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
}

/**
 * A Wallet-style row: icon, text, amount, and a hairline. No card, no border,
 * no visible controls.
 *
 * Swipe left to delete, right to edit. Tapping opens the editor — the swipe is
 * an accelerator, not the only way in, because a gesture is unreachable by
 * keyboard and undiscoverable with a mouse.
 */
export const TransactionRow = forwardRef<HTMLLIElement, TransactionRowProps>(function TransactionRow(
  { tx, isOpen, onOpenChange, onEdit, onDelete },
  // `AnimatePresence mode="popLayout"` measures the outgoing row, so it needs
  // a ref on the real DOM node.
  ref,
) {
  const { language } = useLanguage();
  const categoryLabel = useCategoryLabel();
  const x = useMotionValue(0);
  /**
   * Where the press started, so the click that follows a drag can be told from
   * a real tap. Measured off the raw pointer rather than framer's drag events:
   * a slow, short drag never crosses framer's start threshold, and the stray
   * click would then open the editor mid-swipe.
   */
  const pressAt = useRef<{ x: number; y: number } | null>(null);

  // Closing is imperative: driving `x` through the `animate` prop while `drag`
  // owns the same value makes the two fight under the pointer.
  useEffect(() => {
    if (!isOpen) {
      const controls = animate(x, 0, SPRING);
      return () => controls.stop();
    }
  }, [isOpen, x]);

  // The action "arms" visibly before a release would commit it.
  const deleteScale = useTransform(x, [-COMMIT, -ACTION_W], [1.2, 1]);
  const editScale = useTransform(x, [ACTION_W, COMMIT], [1, 1.2]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const landing = project(info.offset.x, info.velocity.x);

    if (landing <= -COMMIT) {
      onOpenChange(false);
      onDelete(tx);
      return;
    }
    if (landing >= COMMIT) {
      onOpenChange(false);
      animate(x, 0, SPRING);
      onEdit(tx);
      return;
    }
    if (landing <= -SNAP) {
      onOpenChange(true);
      animate(x, -ACTION_W, SPRING);
      return;
    }
    if (landing >= SNAP) {
      onOpenChange(true);
      animate(x, ACTION_W, SPRING);
      return;
    }
    onOpenChange(false);
    animate(x, 0, SPRING);
  };

  const handleClick = (e: React.MouseEvent) => {
    const start = pressAt.current;
    pressAt.current = null;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) return;
    if (isOpen) {
      onOpenChange(false);
      return;
    }
    onEdit(tx);
  };

  const sign = tx.type === 'expense' ? '-' : '+';
  const icon = CATEGORY_ICONS[tx.category] ?? '💰';

  return (
    // `layout` and the hairline live out here, never on the dragged child: a
    // separator that slides away with the row makes the list fall apart
    // mid-swipe, and `layout` + `drag` on one element fight over `transform`.
    <motion.li
      ref={ref}
      layout
      className="relative overflow-hidden border-b border-hairline last:border-b-0"
    >
      <div className="absolute inset-y-0 left-0 flex w-1/2 items-center bg-surface-muted pl-6">
        <motion.span style={{ scale: editScale }} className="text-ink-secondary">
          <Pencil className="h-[18px] w-[18px]" />
        </motion.span>
      </div>
      <div className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-end bg-expense pr-6">
        <motion.span style={{ scale: deleteScale }} className="text-white">
          <Trash2 className="h-[18px] w-[18px]" />
        </motion.span>
      </div>

      <motion.div
        drag="x"
        // Without the lock, a diagonal drag steals the vertical scroll.
        dragDirectionLock
        dragElastic={0.12}
        dragMomentum={false}
        dragConstraints={{ left: -COMMIT - 40, right: COMMIT + 40 }}
        onDragEnd={handleDragEnd}
        onPointerDown={(e) => { pressAt.current = { x: e.clientX, y: e.clientY }; }}
        onClick={handleClick}
        style={{ x }}
        className="relative flex cursor-pointer items-center gap-3 bg-surface py-3 pl-4 pr-4 active:bg-surface-muted/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[17px] leading-none">
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium leading-tight text-ink">
            {categoryLabel(tx.category)}
          </p>
          {tx.description && (
            <p className="truncate text-[13px] leading-tight text-ink-secondary">
              {tx.description}
            </p>
          )}
          <p className="mt-0.5 text-[12px] leading-tight text-ink-tertiary">
            {formatDate(tx.occurredOn)}
          </p>
        </div>

        <span
          className={cn(
            'tnum shrink-0 text-[15px] font-semibold',
            tx.type === 'expense' ? 'text-expense' : 'text-income',
          )}
        >
          {sign}
          {formatCurrency(tx.amount, tx.currency)}
        </span>

        {/* Invisible until tabbed to, so the gesture-only actions stay operable
            by keyboard and assistive tech. */}
        <span className="sr-only focus-within:not-sr-only">
          <button type="button" onClick={() => onEdit(tx)}>
            {language === 'es' ? 'Editar' : 'Edit'}
          </button>
          <button type="button" onClick={() => onDelete(tx)}>
            {language === 'es' ? 'Eliminar' : 'Delete'}
          </button>
        </span>
      </motion.div>
    </motion.li>
  );
});
