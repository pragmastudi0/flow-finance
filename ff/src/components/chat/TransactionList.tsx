import { AnimatePresence, motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import type { ParsedTransaction } from '@/domain/parser';
import type { Transaction } from '@/types/models';

type Tx = ParsedTransaction | Transaction;

interface TransactionListProps {
  transactions: Tx[];
  onDelete?: (id: string) => void;
  onEdit?: (tx: any) => void;
  loading?: boolean;
  emptyMessage?: string;
}

function Skeleton() {
  return (
    <div className="space-y-3 px-4">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex animate-pulse items-stretch gap-3 rounded-2xl border bg-card p-4"
        >
          <div className="h-10 w-10 shrink-0 rounded-xl bg-muted" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-3 w-40 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TransactionList({ transactions, onDelete, onEdit, loading, emptyMessage }: TransactionListProps) {
  if (loading) return <Skeleton />;

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Inbox className="mb-3 h-12 w-12" />
        <p className="text-sm">{emptyMessage ?? 'No transactions yet'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4 pb-2">
      <AnimatePresence initial={false}>
        {transactions.map((tx, index) => {
          const key = 'id' in tx ? tx.id : `pending-${tx.rawInput}-${index}`;
          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <ChatBubble
                transaction={tx}
                onDelete={onDelete}
                onEdit={onEdit}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
