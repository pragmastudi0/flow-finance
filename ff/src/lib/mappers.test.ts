import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  toSavingsGoal,
  toTransaction,
  toTransactionRow,
} from './mappers.ts';

test('reads a snake_case Postgres row into the camelCase model', () => {
  const tx = toTransaction({
    id: 'abc',
    type: 'expense',
    amount: '4500.00',
    currency: 'ARS',
    fx_rate: '1.0000',
    category: 'food',
    description: 'Almuerzo',
    occurred_on: '2026-07-27',
    raw_input: '4500 almuerzo',
    calculation: null,
    created_at: '2026-07-27T15:04:05.000Z',
  });

  // The regression: `occurredOn` used to come back undefined, which made the
  // Home month filter drop every transaction that had just been saved.
  assert.equal(tx.occurredOn, '2026-07-27');
  assert.equal(tx.fxRate, 1);
  assert.equal(tx.amount, 4500);
  assert.equal(tx.rawInput, '4500 almuerzo');
  assert.equal(tx.createdAt, '2026-07-27T15:04:05.000Z');
});

test('reads a row already stored in camelCase (demo localStorage)', () => {
  const tx = toTransaction({
    id: 'abc',
    type: 'income',
    amount: 500000,
    currency: 'ARS',
    fxRate: 1,
    category: 'salary',
    description: 'Salario',
    occurredOn: '2026-07-01',
    createdAt: '2026-07-01T10:00:00.000Z',
  });

  assert.equal(tx.occurredOn, '2026-07-01');
  assert.equal(tx.type, 'income');
});

test('fills defaults instead of producing undefined fields', () => {
  const tx = toTransaction({ id: 'x', type: 'expense', amount: 10 });

  assert.equal(tx.fxRate, 1);
  assert.equal(tx.currency, 'ARS');
  assert.equal(tx.category, 'other');
  assert.equal(tx.occurredOn, '');
  assert.equal(tx.rawInput, null);
});

test('truncates timestamp columns to a plain date', () => {
  const tx = toTransaction({ id: 'x', type: 'expense', amount: 1, occurred_on: '2026-07-27T00:00:00+00:00' });
  assert.equal(tx.occurredOn, '2026-07-27');
});

test('writes the model back as snake_case columns', () => {
  const row = toTransactionRow({
    type: 'expense',
    amount: 100,
    fxRate: 1350,
    currency: 'USD',
    occurredOn: '2026-07-27',
    rawInput: 'usd 100 hotel',
  });

  assert.deepEqual(row, {
    type: 'expense',
    amount: 100,
    fx_rate: 1350,
    currency: 'USD',
    occurred_on: '2026-07-27',
    raw_input: 'usd 100 hotel',
  });
});

test('omits absent keys so partial updates stay partial', () => {
  assert.deepEqual(toTransactionRow({ category: 'food' }), { category: 'food' });
});

test('maps the savings progress view', () => {
  const goal = toSavingsGoal({
    id: 'g1',
    description: 'Viaje',
    goal_amount: '3000000',
    target_date: '2027-06-01',
    status: 'active',
    current_saved_amount: '450000',
    remaining_amount: '2550000',
    progress_pct: '15',
  });

  assert.equal(goal.goalAmount, 3000000);
  assert.equal(goal.targetDate, '2027-06-01');
  assert.equal(goal.progressPct, 15);
});
