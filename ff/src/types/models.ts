import type { Currency } from '../domain/parser.ts';
import type { TxType } from '../domain/categories.ts';

export type { Currency, TxType };

export interface Transaction {
  id: string;
  type: TxType;
  /** As entered, in `currency`. Base (ARS) value = amount * fxRate. */
  amount: number;
  currency: Currency;
  fxRate: number;
  category: string;
  description: string;
  occurredOn: string;
  rawInput: string | null;
  calculation: string | null;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: TxType;
}

export interface CategoryLearning {
  id: string;
  keyword: string;
  category: string;
  type: TxType;
}

export type RecurrenceType = 'installments' | 'subscription';
export type FixedStatus = 'active' | 'cancelled' | 'completed';

export interface FixedExpense {
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  category: string;
  recurrence: RecurrenceType;
  startDate: string;
  installments: number | null;
  remainingInstallments: number | null;
  status: FixedStatus;
  cancelledOn: string | null;
}

export interface SavingsGoal {
  id: string;
  description: string;
  goalAmount: number;
  targetDate: string;
  status: 'active' | 'achieved' | 'archived';
  /** From the `savings_goals_with_progress` view. */
  currentSavedAmount: number;
  remainingAmount: number;
  progressPct: number;
}

export interface SavingsContribution {
  id: string;
  goalId: string;
  /** Negative for withdrawals. */
  amount: number;
  occurredOn: string;
  createdAt: string;
}

export type FetchStatus = 'pending' | 'ok' | 'error';

export interface ExchangeRateConfig {
  id: string;
  sourceUrl: string;
  refreshMinutes: number;
  lastValue: number | null;
  lastUpdatedAt: string | null;
  lastStatus: FetchStatus;
  lastError: string | null;
}

export interface ExchangeRateEntry {
  id: string;
  capturedAt: string;
  status: FetchStatus;
  rateBuy: number | null;
  rateSell: number | null;
  errorMessage: string | null;
}

/** Base-currency (ARS) value of a transaction. */
export const baseAmount = (t: Pick<Transaction, 'amount' | 'fxRate'>) =>
  t.amount * t.fxRate;
