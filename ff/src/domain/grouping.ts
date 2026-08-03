/**
 * Grouping for the transaction list.
 *
 * Pulled out of Home so it can be unit-tested: an off-by-one at the week
 * boundary silently *hides* transactions, which is exactly the kind of bug
 * nobody catches by eye.
 */
import { isSameWeek, isSameDay } from 'date-fns';
import type { Transaction } from '@/types/models.ts';

export type GroupKey = 'today' | 'thisWeek' | 'thisMonth' | (string & {});

export interface TxGroup {
  /** `today` / `thisWeek` / `thisMonth` for the current month, else `yyyy-MM-dd`. */
  key: GroupKey;
  items: Transaction[];
}

/** `yyyy-MM-dd` at local noon, so a timezone offset can never shift the day. */
export function parseDay(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

/**
 * The current month reads as today / this week / earlier; past months read as
 * plain days. `now` is a parameter rather than a `new Date()` inside so tests
 * can pin it — and so a tab left open past midnight re-evaluates "today".
 */
export function groupTransactions(
  transactions: Transaction[],
  { isCurrentMonth, now }: { isCurrentMonth: boolean; now: Date },
): TxGroup[] {
  if (isCurrentMonth) {
    const today: Transaction[] = [];
    const thisWeek: Transaction[] = [];
    const thisMonth: Transaction[] = [];

    for (const tx of transactions) {
      const day = parseDay(tx.occurredOn);
      if (isSameDay(day, now)) today.push(tx);
      else if (isSameWeek(day, now, { weekStartsOn: 1 })) thisWeek.push(tx);
      else thisMonth.push(tx);
    }

    return (
      [
        { key: 'today', items: today },
        { key: 'thisWeek', items: thisWeek },
        { key: 'thisMonth', items: thisMonth },
      ] as TxGroup[]
    ).filter((g) => g.items.length > 0);
  }

  const byDay = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const bucket = byDay.get(tx.occurredOn);
    if (bucket) bucket.push(tx);
    else byDay.set(tx.occurredOn, [tx]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, items]) => ({ key, items }));
}
