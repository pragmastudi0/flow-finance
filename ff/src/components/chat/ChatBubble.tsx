import { motion } from 'framer-motion';
import { Trash2, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useCategoryLabel } from '@/i18n/LanguageProvider';
import { CATEGORY_ICONS, CATEGORY_COLORS } from '@/domain/categories';
import type { ParsedTransaction } from '@/domain/parser';
import type { Transaction } from '@/types/models';
import { formatCurrency, formatDate } from '@/lib/format';

type Tx = ParsedTransaction | Transaction;

function isSaved(tx: Tx): tx is Transaction {
  return 'id' in tx;
}

interface ChatBubbleProps {
  transaction: Tx;
  onDelete?: (id: string) => void;
  onEdit?: (tx: any) => void;
}

export function ChatBubble({ transaction: tx, onDelete, onEdit }: ChatBubbleProps) {
  const categoryLabel = useCategoryLabel();
  const saved = isSaved(tx);
  const color = CATEGORY_COLORS[tx.category] ?? '#64748b';
  const icon = CATEGORY_ICONS[tx.category] ?? '💰';
  const amount = saved ? tx.amount : tx.amount;
  const currency = saved ? tx.currency : tx.currency;
  const description = saved ? tx.description : tx.description;
  const dateStr = saved ? tx.occurredOn : tx.date;
  const sign = tx.type === 'expense' ? '-' : '+';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'group relative flex items-stretch gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md',
        !saved && 'border-dashed border-2 opacity-90',
      )}
    >
      <div
        className="flex shrink-0 items-center justify-center rounded-xl px-2 text-lg"
        style={{ backgroundColor: color + '20' }}
      >
        <span>{icon}</span>
      </div>

      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
        style={{ backgroundColor: color }}
      />

      <div className="ml-3 flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-muted-foreground">
            {categoryLabel(tx.category)}
          </span>
          <span
            className={cn(
              'shrink-0 text-base font-bold tabular-nums',
              tx.type === 'expense' ? 'text-red-600' : 'text-green-600',
            )}
          >
            {sign}
            {formatCurrency(amount, currency)}
          </span>
        </div>
        <span className="truncate text-sm text-foreground">{description}</span>
        <span className="text-xs text-muted-foreground">{formatDate(dateStr)}</span>
      </div>

      <div
        className={cn(
          'flex shrink-0 items-center gap-1',
          saved
            ? 'absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100'
            : 'ml-2',
        )}
      >
        {saved ? (
          <>
            {onEdit && (
              <button
                onClick={() => onEdit(tx)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(tx.id)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <>
            {onEdit && (
              <button
                onClick={() => onEdit(tx)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white transition-colors hover:bg-green-600"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete((tx as ParsedTransaction).rawInput ?? '')}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
