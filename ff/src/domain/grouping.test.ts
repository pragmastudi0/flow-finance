import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { groupTransactions } from './grouping.ts';
import type { Transaction } from '../types/models.ts';

function tx(occurredOn: string, id = occurredOn): Transaction {
  return {
    id,
    type: 'expense',
    amount: 1000,
    currency: 'ARS',
    fxRate: 1,
    category: 'food',
    description: 'test',
    occurredOn,
    rawInput: null,
    calculation: null,
    createdAt: `${occurredOn}T12:00:00.000Z`,
  };
}

// Thursday.
const NOW = new Date('2026-07-30T12:00:00');

test('splits the current month into today / this week / earlier', () => {
  const groups = groupTransactions(
    [tx('2026-07-30'), tx('2026-07-28'), tx('2026-07-05')],
    { isCurrentMonth: true, now: NOW },
  );

  assert.deepEqual(
    groups.map((g) => g.key),
    ['today', 'thisWeek', 'thisMonth'],
  );
  assert.equal(groups[0].items[0].occurredOn, '2026-07-30');
  assert.equal(groups[1].items[0].occurredOn, '2026-07-28');
  assert.equal(groups[2].items[0].occurredOn, '2026-07-05');
});

test('drops empty buckets instead of rendering blank headings', () => {
  const groups = groupTransactions([tx('2026-07-05')], {
    isCurrentMonth: true,
    now: NOW,
  });

  assert.deepEqual(
    groups.map((g) => g.key),
    ['thisMonth'],
  );
});

test('the week starts on Monday', () => {
  // 2026-07-27 is the Monday of NOW's week; 2026-07-26 is the Sunday before it.
  const groups = groupTransactions([tx('2026-07-27'), tx('2026-07-26')], {
    isCurrentMonth: true,
    now: NOW,
  });

  const week = groups.find((g) => g.key === 'thisWeek');
  const earlier = groups.find((g) => g.key === 'thisMonth');
  assert.equal(week?.items.length, 1);
  assert.equal(week?.items[0].occurredOn, '2026-07-27');
  assert.equal(earlier?.items[0].occurredOn, '2026-07-26');
});

test('past months group by day, newest first', () => {
  const groups = groupTransactions(
    [tx('2026-06-02', 'a'), tx('2026-06-17', 'b'), tx('2026-06-02', 'c')],
    { isCurrentMonth: false, now: NOW },
  );

  assert.deepEqual(
    groups.map((g) => g.key),
    ['2026-06-17', '2026-06-02'],
  );
  assert.equal(groups[1].items.length, 2);
});

test('a date-only string is never shifted by the timezone', () => {
  // Parsed at midnight UTC this lands on the 29th west of Greenwich, which
  // would file "today" under "this week".
  const groups = groupTransactions([tx('2026-07-30')], {
    isCurrentMonth: true,
    now: NOW,
  });

  assert.equal(groups[0].key, 'today');
});
