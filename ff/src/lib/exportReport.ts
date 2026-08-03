import * as XLSX from 'xlsx';
import type { Transaction } from '@/types/models.ts';

/** Column headings, already translated by the caller. */
export interface ExportLabels {
  date: string;
  description: string;
  category: string;
  type: string;
  amount: string;
  expense: string;
  income: string;
  sheet: string;
  filename: string;
}

/** Writes the period's transactions to an .xlsx download. */
export function exportTransactions(
  transactions: Transaction[],
  labels: ExportLabels,
  startDate: string,
): void {
  const rows = transactions.map((tx) => ({
    [labels.date]: tx.occurredOn,
    [labels.description]: tx.description,
    [labels.category]: tx.category,
    [labels.type]: tx.type === 'expense' ? labels.expense : labels.income,
    [labels.amount]: tx.amount,
    Currency: tx.currency,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), labels.sheet);
  XLSX.writeFile(wb, `${labels.filename}-${startDate}.xlsx`);
}
