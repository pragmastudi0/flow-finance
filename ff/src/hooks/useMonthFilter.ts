import { useCallback, useMemo, useState } from 'react';
import type { Transaction } from '@/types/models.ts';
import { parseDay } from '@/domain/grouping.ts';

export interface MonthFilter {
  /** Always the first of the month, at local midnight. */
  month: Date;
  isCurrentMonth: boolean;
  /** Direction of the last navigation, so the label can slide the right way. */
  direction: 1 | -1;
  prev: () => void;
  next: () => void;
  today: () => void;
  /** Brings the month containing `yyyy-MM-dd` into view. */
  showMonthOf: (iso: string) => void;
  matches: (tx: Transaction) => boolean;
}

const firstOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/**
 * Which month the Home list is showing.
 *
 * This lived inline in Home, and Reports grew a second, incompatible period
 * model beside it. Anything that navigates months should use this.
 */
export function useMonthFilter(): MonthFilter {
  const [month, setMonth] = useState(() => firstOf(new Date()));
  const [direction, setDirection] = useState<1 | -1>(1);

  const step = useCallback((delta: 1 | -1) => {
    setDirection(delta);
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }, []);

  const prev = useCallback(() => step(-1), [step]);
  const next = useCallback(() => step(1), [step]);

  const goTo = useCallback(
    (target: Date) => {
      const first = firstOf(target);
      if (first.getTime() === month.getTime()) return;
      setDirection(first > month ? 1 : -1);
      setMonth(first);
    },
    [month],
  );

  const today = useCallback(() => goTo(new Date()), [goTo]);

  const showMonthOf = useCallback(
    (iso: string) => {
      const d = parseDay(iso);
      if (Number.isNaN(d.getTime())) return;
      goTo(d);
    },
    [goTo],
  );

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return month.getMonth() === now.getMonth() && month.getFullYear() === now.getFullYear();
  }, [month]);

  const matches = useCallback(
    (tx: Transaction) => {
      const d = parseDay(tx.occurredOn);
      return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    },
    [month],
  );

  return { month, isCurrentMonth, direction, prev, next, today, showMonthOf, matches };
}
