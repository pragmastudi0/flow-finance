import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isReconcilable, payableByCard, reconcile } from './matching.ts';
import type { AppExpense, BankMovement } from './types.ts';

function movement(overrides: Partial<BankMovement> & { id: string }): BankMovement {
  return {
    occurredOn: '2026-08-28',
    description: 'UBER *TRIP 45821',
    amount: 4752,
    currency: 'ARS',
    direction: 'debit',
    kind: 'purchase',
    sourceReference: null,
    installmentCurrent: null,
    installmentTotal: null,
    cardLast4: '3377',
    fingerprint: overrides.id,
    rawLine: '',
    status: 'unmatched',
    matchedTransactionId: null,
    ...overrides,
  };
}

function expense(overrides: Partial<AppExpense> & { id: string }): AppExpense {
  return {
    occurredOn: '2026-08-28',
    description: 'Uber',
    amount: 4752,
    currency: 'ARS',
    category: 'transport',
    ...overrides,
  };
}

test('reconciliation/matching', async (t) => {
  await t.test('case 1 — an exact pair is a high-confidence match', () => {
    const result = reconcile([movement({ id: 'm1' })], [expense({ id: 'e1' })]);
    assert.equal(result.matches.length, 1);
    assert.equal(result.review.length, 0);
    assert.equal(result.matches[0].expense.id, 'e1');
    assert.equal(result.matches[0].score.total, 100);
  });

  await t.test('case 2 + 3 — different amount and date still match', () => {
    const result = reconcile(
      [movement({ id: 'm1', occurredOn: '2026-08-29', amount: 4752 })],
      [expense({ id: 'e1', occurredOn: '2026-08-28', amount: 4000 })],
    );
    assert.equal(result.matches.length + result.review.length, 1);
    const [suggestion] = [...result.matches, ...result.review];
    assert.equal(suggestion.difference, 752);
    assert.ok(suggestion.score.total >= 70);
  });

  await t.test('case 5 — unrelated movements are never reconciled', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'NETFLIX.COM', amount: 12000 })],
      [expense({ id: 'e1', description: 'Carrefour', amount: 4752, occurredOn: '2026-08-27' })],
    );
    assert.equal(result.matches.length, 0);
    assert.equal(result.review.length, 0);
    assert.equal(result.recommended.length, 0);
    assert.equal(result.unmatchedMovements.length, 1);
    assert.equal(result.unmatchedExpenses.length, 1);
  });

  await t.test('case 5b — same amount and day is a recommendation, never a match', () => {
    // Two clearly different merchants that happen to cost the same on the
    // same day. Worth showing — it is how `nafta` finds a service station —
    // but it is a recommendation the user (or the model) has to settle.
    const result = reconcile(
      [movement({ id: 'm1', description: 'NETFLIX.COM', amount: 12000 })],
      [expense({ id: 'e1', description: 'Carrefour', amount: 12000 })],
    );
    assert.equal(result.matches.length, 0);
    assert.equal(result.review.length, 0);
    assert.equal(result.recommended.length, 1);
    assert.equal(result.recommended[0].confidence, 'review');
  });

  await t.test('case 6 — one movement is never assigned to two expenses', () => {
    const result = reconcile(
      [movement({ id: 'm1', amount: 4000 })],
      [
        expense({ id: 'e1', amount: 4000 }),
        expense({ id: 'e2', amount: 5000 }),
      ],
    );
    const assigned = [...result.matches, ...result.review];
    assert.equal(assigned.length, 1);
    // The closer amount wins, and the other expense stays open.
    assert.equal(assigned[0].expense.id, 'e1');
    assert.deepEqual(result.unmatchedExpenses.map((e) => e.id), ['e2']);
  });

  await t.test('case 6b — three same-merchant charges pair off one to one', () => {
    const result = reconcile(
      [
        movement({ id: 'm1', amount: 4000 }),
        movement({ id: 'm2', amount: 4200 }),
        movement({ id: 'm3', amount: 4500 }),
      ],
      [
        expense({ id: 'e1', amount: 4000 }),
        expense({ id: 'e2', amount: 4200 }),
        expense({ id: 'e3', amount: 4500 }),
      ],
    );
    const assigned = [...result.matches, ...result.review];
    assert.equal(assigned.length, 3);
    assert.equal(new Set(assigned.map((s) => s.movement.id)).size, 3);
    assert.equal(new Set(assigned.map((s) => s.expense.id)).size, 3);
    for (const suggestion of assigned) {
      assert.equal(suggestion.movement.amount, suggestion.expense.amount);
    }
  });

  await t.test('case 7 — a movement with no counterpart is reported as unregistered', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'DL*SPOTIFY', amount: 5499, occurredOn: '2026-08-29' })],
      [expense({ id: 'e1', description: 'Uber', amount: 4752 })],
    );
    assert.deepEqual(result.unmatchedMovements.map((m) => m.id), ['m1']);
  });

  await t.test('case 8 — an expense with no movement is reported too', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'DL*SPOTIFY', amount: 5499 })],
      [expense({ id: 'e1', description: 'Netflix', amount: 12000, occurredOn: '2026-08-27' })],
    );
    assert.deepEqual(result.unmatchedExpenses.map((e) => e.id), ['e1']);
  });

  await t.test('case 9 — an expense already reconciled is not offered again', () => {
    const result = reconcile(
      [movement({ id: 'm1' })],
      [expense({ id: 'e1', reconciledMovementId: 'earlier' })],
    );
    assert.equal(result.matches.length, 0);
    assert.equal(result.unmatchedExpenses.length, 0);
    assert.deepEqual(result.unmatchedMovements.map((m) => m.id), ['m1']);
  });

  await t.test('currencies are never crossed', () => {
    const result = reconcile(
      [movement({ id: 'm1', currency: 'USD', amount: 9.5, description: 'Facebk' })],
      [expense({ id: 'e1', currency: 'ARS', amount: 9.5, description: 'Facebk' })],
    );
    assert.equal(result.matches.length + result.review.length, 0);
  });

  await t.test('card payments and refunds are set aside, not matched', () => {
    const payment = movement({ id: 'p1', kind: 'payment', direction: 'credit', description: 'Su pago en pesos' });
    const refund = movement({ id: 'r1', kind: 'refund', direction: 'credit' });
    assert.equal(isReconcilable(payment), false);
    assert.equal(isReconcilable(refund), false);

    const result = reconcile([payment, refund, movement({ id: 'm1' })], [expense({ id: 'e1' })]);
    assert.deepEqual(result.informational.map((m) => m.id).sort(), ['p1', 'r1']);
    assert.equal(result.matches.length, 1);
  });

  await t.test('an anchor never takes a movement from a description-led pair', () => {
    // The anchor would score 89 against m1 and the description-led pair only
    // ~75, but shared merchants beat shared arithmetic: the first pass claims
    // m1, and the anchor has to look elsewhere.
    const result = reconcile(
      [movement({ id: 'm1', description: 'PAYU*AR*UBER', amount: 4000 })],
      [
        expense({ id: 'e1', description: 'Uber', amount: 4600 }),
        expense({ id: 'e2', description: 'nafta', amount: 4000 }),
      ],
    );
    const [suggestion] = [...result.matches, ...result.review];
    assert.equal(suggestion.expense.id, 'e1');
    assert.equal(result.recommended.length, 0);
    assert.deepEqual(result.unmatchedExpenses.map((e) => e.id), ['e2']);
  });

  await t.test('the summary counts what the screen shows', () => {
    const result = reconcile(
      [movement({ id: 'm1' }), movement({ id: 'm2', description: 'DL*SPOTIFY', amount: 5499 })],
      [expense({ id: 'e1' }), expense({ id: 'e2', description: 'Netflix', amount: 12000 })],
    );
    assert.deepEqual(result.summary, {
      movements: 2,
      expenses: 2,
      matched: 1,
      review: 0,
      recommended: 0,
      unmatchedMovements: 1,
      unmatchedExpenses: 1,
    });
  });
});

test('reconciliation/anchors', async (t) => {
  const nafta = () =>
    reconcile(
      [movement({ id: 'm1', description: 'Est servicio alaminos', amount: 40000, occurredOn: '2026-08-13' })],
      [expense({ id: 'e1', description: 'nafta', category: 'transport', amount: 40000, occurredOn: '2026-08-13' })],
    );

  await t.test('the real case: same amount, same day, nothing in common in the text', () => {
    const result = nafta();
    assert.equal(result.recommended.length, 1);

    const [suggestion] = result.recommended;
    assert.equal(suggestion.source, 'amount-anchor');
    assert.equal(suggestion.score.description, 0);
    assert.equal(suggestion.score.total, 89);
    // The old engine could not even produce this pair: the description gate
    // dropped it, and the weighted score would have been 50.
    assert.equal(result.matches.length, 0);
    assert.equal(result.review.length, 0);
  });

  await t.test('an anchor is capped below high confidence', () => {
    const [suggestion] = nafta().recommended;
    assert.equal(suggestion.confidence, 'review');
    assert.ok(suggestion.score.total < 90);
  });

  await t.test('one day apart still anchors, and scores lower', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'Est servicio alaminos', amount: 40000, occurredOn: '2026-08-14' })],
      [expense({ id: 'e1', description: 'nafta', amount: 40000, occurredOn: '2026-08-13' })],
    );
    assert.equal(result.recommended.length, 1);
    assert.equal(result.recommended[0].score.total, 85);
  });

  await t.test('two days apart does not anchor', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'Est servicio alaminos', amount: 40000, occurredOn: '2026-08-15' })],
      [expense({ id: 'e1', description: 'nafta', amount: 40000, occurredOn: '2026-08-13' })],
    );
    assert.equal(result.recommended.length, 0);
  });

  await t.test('a 5% amount gap does not anchor', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'Est servicio alaminos', amount: 42000, occurredOn: '2026-08-13' })],
      [expense({ id: 'e1', description: 'nafta', amount: 40000, occurredOn: '2026-08-13' })],
    );
    assert.equal(result.recommended.length, 0);
  });

  await t.test('anchors are assigned one to one like everything else', () => {
    const result = reconcile(
      [
        movement({ id: 'm1', description: 'Est servicio alaminos', amount: 40000, occurredOn: '2026-08-13' }),
        movement({ id: 'm2', description: 'Est servicio alaminos', amount: 40000, occurredOn: '2026-08-13' }),
      ],
      [expense({ id: 'e1', description: 'nafta', amount: 40000, occurredOn: '2026-08-13' })],
    );
    assert.equal(result.recommended.length, 1);
    assert.equal(result.unmatchedMovements.length, 1);
  });

  await t.test('the anchor route can be switched off', () => {
    const result = reconcile(
      [movement({ id: 'm1', description: 'Est servicio alaminos', amount: 40000, occurredOn: '2026-08-13' })],
      [expense({ id: 'e1', description: 'nafta', amount: 40000, occurredOn: '2026-08-13' })],
      { config: { anchors: { enabled: false, maxDayDistance: 1, maxAmountPct: 0.01, maxScore: 89 } } },
    );
    assert.equal(result.recommended.length, 0);
  });
});

test('reconciliation/paymentMethod', async (t) => {
  await t.test('cash, transfer and debit cannot be on a credit statement', () => {
    for (const method of ['cash', 'transfer', 'debit'] as const) {
      assert.equal(payableByCard(expense({ id: 'e1', paymentMethod: method })), false);
    }
  });

  await t.test('credit, other and "nobody said" stay eligible', () => {
    assert.equal(payableByCard(expense({ id: 'e1', paymentMethod: 'credit' })), true);
    assert.equal(payableByCard(expense({ id: 'e1', paymentMethod: 'other' })), true);
    // Every row that predates the column. Excluding these would leave
    // nothing to reconcile.
    assert.equal(payableByCard(expense({ id: 'e1', paymentMethod: null })), true);
    assert.equal(payableByCard(expense({ id: 'e1' })), true);
  });

  await t.test('a cash expense is not offered, and drops out of the counts', () => {
    const result = reconcile(
      [movement({ id: 'm1' })],
      [expense({ id: 'e1', paymentMethod: 'cash' })],
    );
    assert.equal(result.matches.length, 0);
    assert.equal(result.unmatchedExpenses.length, 0);
    assert.equal(result.summary.expenses, 0);
    assert.deepEqual(result.unmatchedMovements.map((m) => m.id), ['m1']);
  });

  await t.test('a card expense wins the tie against one with no method', () => {
    const result = reconcile(
      [movement({ id: 'm1' })],
      [
        expense({ id: 'e-unknown' }),
        expense({ id: 'e-card', paymentMethod: 'credit' }),
      ],
    );
    const [suggestion] = [...result.matches, ...result.review];
    assert.equal(suggestion.expense.id, 'e-card');
  });
});
