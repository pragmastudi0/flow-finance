import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import type { Transaction } from '../types/models.ts';
import {
  aggregateByCategory,
  filterCategoryTransactions,
  totalBaseAmount,
} from './reporting.ts';

function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    amount: 1000,
    currency: 'ARS',
    fxRate: 1,
    category: 'shopping',
    description: 'Compra',
    occurredOn: '2026-09-10',
    paymentMethod: 'cash',
    rawInput: null,
    calculation: null,
    createdAt: '2026-09-10T12:00:00.000Z',
    ...overrides,
  };
}

test('aggregates categories in base currency and keeps all categories', () => {
  const movements = [
    tx({ id: 'a', amount: 120, currency: 'USD', fxRate: 1000 }),
    tx({ id: 'b', amount: 500, category: 'bills' }),
    tx({ id: 'c', amount: 200, category: 'shopping' }),
    tx({ id: 'income', type: 'income', category: 'salary', amount: 9000 }),
  ];

  assert.deepEqual(aggregateByCategory(movements, 'expense'), [
    { name: 'shopping', value: 120200 },
    { name: 'bills', value: 500 },
  ]);
  assert.deepEqual(aggregateByCategory(movements, 'income'), [
    { name: 'salary', value: 9000 },
  ]);
});

test('filters a category by date, payment method, type and search text', () => {
  const movements = [
    tx({ id: 'one', description: 'Proveedor A', occurredOn: '2026-09-02' }),
    tx({ id: 'two', description: 'Proveedor B', occurredOn: '2026-09-05', paymentMethod: 'credit' }),
    tx({ id: 'other-category', category: 'bills', description: 'Proveedor A' }),
    tx({ id: 'income', type: 'income', category: 'shopping', description: 'Venta' }),
  ];

  const result = filterCategoryTransactions(movements, {
    category: 'shopping',
    type: 'expense',
    startDate: '2026-09-01',
    endDate: '2026-09-04',
    paymentMethod: 'cash',
    search: 'proveedor',
  });

  assert.deepEqual(result.map((movement) => movement.id), ['one']);
});

test('allows all types and returns an exact filtered total', () => {
  const movements = [
    tx({ id: 'expense', amount: 1000 }),
    tx({ id: 'refund', type: 'income', amount: -250, category: 'shopping' }),
  ];

  const result = filterCategoryTransactions(movements, {
    category: 'shopping',
    type: 'all',
    startDate: '',
    endDate: '',
    paymentMethod: 'all',
    search: '',
  });

  assert.equal(totalBaseAmount(result), 750);
});
