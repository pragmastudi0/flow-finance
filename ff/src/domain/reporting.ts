import type { PaymentMethod, Transaction } from '../types/models.ts';
import { baseAmount } from '../types/models.ts';

export type ReportTransactionType = Transaction['type'] | 'all';

export interface CategorySlice {
  name: string;
  value: number;
}

export interface CategoryMovementFilters {
  category: string;
  type: ReportTransactionType;
  startDate: string;
  endDate: string;
  paymentMethod: PaymentMethod | 'all';
  search: string;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase();

function categoryFor(transaction: Transaction): string {
  return transaction.category || (transaction.type === 'income' ? 'other_income' : 'other');
}

export function totalBaseAmount(transactions: Transaction[]): number {
  return transactions.reduce((sum, transaction) => sum + baseAmount(transaction), 0);
}

export function aggregateByCategory(
  transactions: Transaction[],
  type: Transaction['type'],
): CategorySlice[] {
  const totals = new Map<string, number>();

  transactions.forEach((transaction) => {
    if (transaction.type !== type) return;
    const category = categoryFor(transaction);
    totals.set(category, (totals.get(category) ?? 0) + baseAmount(transaction));
  });

  return Array.from(totals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function filterCategoryTransactions(
  transactions: Transaction[],
  filters: CategoryMovementFilters,
): Transaction[] {
  const search = normalize(filters.search);

  return transactions.filter((transaction) => {
    if (filters.category && categoryFor(transaction) !== filters.category) return false;
    if (filters.type !== 'all' && transaction.type !== filters.type) return false;
    if (filters.startDate && transaction.occurredOn < filters.startDate) return false;
    if (filters.endDate && transaction.occurredOn > filters.endDate) return false;
    if (
      filters.paymentMethod !== 'all' &&
      (transaction.paymentMethod ?? '') !== filters.paymentMethod
    ) {
      return false;
    }
    if (search) {
      const haystack = normalize(
        [transaction.description, transaction.category, transaction.rawInput ?? ''].join(' '),
      );
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}
