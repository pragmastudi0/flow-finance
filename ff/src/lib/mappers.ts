/**
 * Row ↔ model mapping.
 *
 * Postgres columns are snake_case (`occurred_on`, `fx_rate`) but the app models
 * are camelCase (`occurredOn`, `fxRate`). Reading rows straight into the models
 * left those fields `undefined`, which silently broke every date filter — a
 * transaction would save fine and then vanish from the Home month view.
 *
 * The `to*` readers accept either shape, so rows already stored with the wrong
 * casing (demo-mode localStorage) are healed on read.
 */
import type {
  Category,
  CategoryLearning,
  ExchangeRateConfig,
  ExchangeRateEntry,
  FixedExpense,
  SavingsGoal,
  Transaction,
} from '@/types/models.ts';

type Row = Record<string, any>;

/** First defined value among `keys`. */
function pick(row: Row, ...keys: string[]): any {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null) return row[key];
  }
  return undefined;
}

/** Postgres `numeric` arrives as a string through PostgREST. */
function num(value: any, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/** Timestamps come back as ISO datetimes; date-only fields expect `yyyy-MM-dd`. */
function isoDate(value: any): string {
  if (typeof value !== 'string' || !value) return '';
  return value.slice(0, 10);
}

export function toTransaction(row: Row): Transaction {
  return {
    id: row.id,
    type: row.type === 'income' ? 'income' : 'expense',
    amount: num(row.amount, 0),
    currency: pick(row, 'currency') ?? 'ARS',
    fxRate: num(pick(row, 'fxRate', 'fx_rate'), 1),
    category: pick(row, 'category') ?? 'other',
    description: pick(row, 'description') ?? '',
    occurredOn: isoDate(pick(row, 'occurredOn', 'occurred_on')),
    rawInput: pick(row, 'rawInput', 'raw_input') ?? null,
    calculation: pick(row, 'calculation') ?? null,
    createdAt: pick(row, 'createdAt', 'created_at') ?? '',
  };
}

export interface TransactionInput {
  type: 'expense' | 'income';
  amount: number;
  currency: string;
  fxRate: number;
  category: string;
  description: string;
  occurredOn: string;
  rawInput?: string | null;
  calculation?: string | null;
}

/** Model → Postgres row. Only the keys present are emitted, so it works for updates too. */
export function toTransactionRow(tx: Partial<TransactionInput>): Row {
  const row: Row = {};
  if (tx.type !== undefined) row.type = tx.type;
  if (tx.amount !== undefined) row.amount = tx.amount;
  if (tx.currency !== undefined) row.currency = tx.currency;
  if (tx.fxRate !== undefined) row.fx_rate = tx.fxRate;
  if (tx.category !== undefined) row.category = tx.category;
  if (tx.description !== undefined) row.description = tx.description;
  if (tx.occurredOn !== undefined) row.occurred_on = tx.occurredOn;
  if (tx.rawInput !== undefined) row.raw_input = tx.rawInput;
  if (tx.calculation !== undefined) row.calculation = tx.calculation;
  return row;
}

export function toCategory(row: Row): Category {
  return {
    id: row.id,
    name: pick(row, 'name') ?? '',
    icon: pick(row, 'icon') ?? '📄',
    color: pick(row, 'color') ?? '#64748b',
    type: row.type === 'income' ? 'income' : 'expense',
  };
}

export function toCategoryLearning(row: Row): CategoryLearning {
  return {
    id: row.id,
    keyword: pick(row, 'keyword') ?? '',
    category: pick(row, 'category') ?? 'other',
    type: row.type === 'income' ? 'income' : 'expense',
  };
}

export function toFixedExpense(row: Row): FixedExpense {
  return {
    id: row.id,
    description: pick(row, 'description') ?? '',
    amount: num(row.amount, 0),
    currency: pick(row, 'currency') ?? 'ARS',
    category: pick(row, 'category') ?? 'other',
    recurrence: pick(row, 'recurrence') === 'installments' ? 'installments' : 'subscription',
    startDate: isoDate(pick(row, 'startDate', 'start_date')),
    installments: pick(row, 'installments') ?? null,
    remainingInstallments:
      pick(row, 'remainingInstallments', 'remaining_installments') ?? null,
    status: pick(row, 'status') ?? 'active',
    cancelledOn: isoDate(pick(row, 'cancelledOn', 'cancelled_on')) || null,
  };
}

export function toSavingsGoal(row: Row): SavingsGoal {
  return {
    id: row.id,
    description: pick(row, 'description') ?? '',
    goalAmount: num(pick(row, 'goalAmount', 'goal_amount'), 0),
    targetDate: isoDate(pick(row, 'targetDate', 'target_date')),
    status: pick(row, 'status') ?? 'active',
    currentSavedAmount: num(
      pick(row, 'currentSavedAmount', 'current_saved_amount'),
      0,
    ),
    remainingAmount: num(pick(row, 'remainingAmount', 'remaining_amount'), 0),
    progressPct: num(pick(row, 'progressPct', 'progress_pct'), 0),
  };
}

export function toExchangeRateConfig(row: Row | null): ExchangeRateConfig | null {
  if (!row) return null;
  return {
    id: row.id,
    sourceUrl: pick(row, 'sourceUrl', 'source_url') ?? '',
    refreshMinutes: num(pick(row, 'refreshMinutes', 'refresh_minutes'), 60),
    lastValue: pick(row, 'lastValue', 'last_value') ?? null,
    lastUpdatedAt: pick(row, 'lastUpdatedAt', 'last_updated_at') ?? null,
    lastStatus: pick(row, 'lastStatus', 'last_status') ?? 'pending',
    lastError: pick(row, 'lastError', 'last_error') ?? null,
  };
}

export function toExchangeRateEntry(row: Row): ExchangeRateEntry {
  return {
    id: row.id,
    capturedAt: pick(row, 'capturedAt', 'captured_at') ?? '',
    status: pick(row, 'status') ?? 'ok',
    rateBuy: pick(row, 'rateBuy', 'rate_buy') ?? null,
    rateSell: pick(row, 'rateSell', 'rate_sell') ?? null,
    errorMessage: pick(row, 'errorMessage', 'error_message') ?? null,
  };
}
