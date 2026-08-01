import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { TransactionRow } from './TransactionRow';
import type { TxGroup } from '@/domain/grouping';
import type { Transaction } from '@/types/models';

interface TransactionListProps {
  groups: TxGroup[];
  label: (key: string) => string;
  onEdit: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => void;
  loading?: boolean;
}

function Skeleton() {
  return (
    <div className="pt-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 border-b border-hairline py-3 pl-4 pr-4">
          <div className="h-10 w-10 shrink-0 rounded-full bg-surface-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-24 rounded bg-surface-muted" />
            <div className="h-3 w-36 rounded bg-surface-muted" />
          </div>
          <div className="h-3.5 w-16 rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}

/**
 * The grouped movement list.
 *
 * Only one row may sit open at a time, so `openId` lives here rather than in
 * each row. `mode="popLayout"` lets a deleted row leave while its siblings
 * spring into the gap, with no height measuring.
 */
export function TransactionList({ groups, label, onEdit, onDelete, loading }: TransactionListProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (loading) return <Skeleton />;

  return (
    <div className="space-y-6 pt-4">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="px-4 pb-1.5 text-[13px] font-medium text-ink-tertiary">
            {label(group.key)}
          </h2>
          {/* `relative` is what lets popLayout park the exiting row. */}
          <ul className="relative -mx-5 px-1">
            <AnimatePresence initial={false} mode="popLayout">
              {group.items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  isOpen={openId === tx.id}
                  onOpenChange={(open) => setOpenId(open ? tx.id : null)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}
