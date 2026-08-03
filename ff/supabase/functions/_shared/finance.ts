/**
 * The structured snapshot sent to the model.
 *
 * Built server-side from the caller's own rows rather than accepted from the
 * client: the browser can't be trusted to describe someone's finances
 * honestly, and this keeps the request small.
 *
 * Only aggregates and short descriptions go out. No ids, no raw input, no
 * receipt contents, no email.
 */
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface CategoryTotal {
  category: string;
  total: number;
  share: number;
  count: number;
}

export interface MonthSummary {
  month: string;
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number;
  byCategory: CategoryTotal[];
  transactionCount: number;
}

export interface SavingsGoalSnapshot {
  description: string;
  goalAmount: number;
  saved: number;
  targetDate: string;
  progressPct: number;
}

export interface FinanceSnapshot {
  currency: 'ARS';
  today: string;
  daysElapsed: number;
  daysInMonth: number;
  current: MonthSummary;
  previous: MonthSummary;
  /** Largest movements this month, for spotting outliers. */
  topTransactions: { description: string; category: string; amount: number; date: string }[];
  savingsGoals: SavingsGoalSnapshot[];
  fixedMonthlyCommitments: number;
}

interface Row {
  type: string;
  amount: number | string;
  fx_rate: number | string | null;
  category: string | null;
  description: string | null;
  occurred_on: string;
}

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

/** Base (ARS) value. USD rows carry a non-1 fx_rate; ignoring it understates them. */
const base = (r: Row) => num(r.amount) * num(r.fx_rate, 1);

const iso = (d: Date) => d.toISOString().slice(0, 10);

function summarise(rows: Row[], month: string): MonthSummary {
  let income = 0;
  let expenses = 0;
  const byCategory = new Map<string, { total: number; count: number }>();

  for (const r of rows) {
    const value = base(r);
    if (r.type === 'income') {
      income += value;
      continue;
    }
    expenses += value;
    const key = r.category || 'other';
    const entry = byCategory.get(key) ?? { total: 0, count: 0 };
    entry.total += value;
    entry.count += 1;
    byCategory.set(key, entry);
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    month,
    income: round(income),
    expenses: round(expenses),
    balance: round(income - expenses),
    savingsRate: income > 0 ? round(((income - expenses) / income) * 100) : 0,
    transactionCount: rows.length,
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({
        category,
        total: round(v.total),
        share: expenses > 0 ? round((v.total / expenses) * 100) : 0,
        count: v.count,
      }))
      .sort((a, b) => b.total - a.total),
  };
}

/** `month` is `yyyy-MM`. */
export async function buildSnapshot(
  db: SupabaseClient,
  userId: string,
  month: string,
): Promise<FinanceSnapshot> {
  const [year, monthIndex] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 0));
  const prevStart = new Date(Date.UTC(year, monthIndex - 2, 1));
  const prevEnd = new Date(Date.UTC(year, monthIndex - 1, 0));

  const { data, error } = await db
    .from('flowfinance_transactions')
    .select('type, amount, fx_rate, category, description, occurred_on')
    .eq('user_id', userId)
    .gte('occurred_on', iso(prevStart))
    .lte('occurred_on', iso(end))
    .order('occurred_on', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  const inRange = (r: Row, from: Date, to: Date) =>
    r.occurred_on >= iso(from) && r.occurred_on <= iso(to);

  const currentRows = rows.filter((r) => inRange(r, start, end));
  const previousRows = rows.filter((r) => inRange(r, prevStart, prevEnd));

  const [{ data: goals }, { data: fixed }] = await Promise.all([
    db
      .from('flowfinance_savings_goals')
      .select('description, goal_amount, target_date, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
    db
      .from('flowfinance_fixed_expenses')
      .select('amount, currency, status')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);

  const now = new Date();
  const isCurrentMonth =
    now.getUTCFullYear() === year && now.getUTCMonth() + 1 === monthIndex;

  return {
    currency: 'ARS',
    today: iso(now),
    daysElapsed: isCurrentMonth ? now.getUTCDate() : end.getUTCDate(),
    daysInMonth: end.getUTCDate(),
    current: summarise(currentRows, month),
    previous: summarise(previousRows, iso(prevStart).slice(0, 7)),
    topTransactions: currentRows
      .filter((r) => r.type === 'expense')
      .sort((a, b) => base(b) - base(a))
      .slice(0, 10)
      .map((r) => ({
        description: (r.description ?? '').slice(0, 60),
        category: r.category ?? 'other',
        amount: Math.round(base(r) * 100) / 100,
        date: r.occurred_on,
      })),
    savingsGoals: (goals ?? []).map((g: Record<string, unknown>) => ({
      description: String(g.description ?? '').slice(0, 60),
      goalAmount: num(g.goal_amount),
      saved: 0,
      targetDate: String(g.target_date ?? ''),
      progressPct: 0,
    })),
    fixedMonthlyCommitments:
      Math.round((fixed ?? []).reduce((sum: number, f: Record<string, unknown>) => sum + num(f.amount), 0) * 100) / 100,
  };
}
