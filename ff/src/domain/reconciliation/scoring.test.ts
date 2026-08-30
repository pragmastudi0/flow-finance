import { test } from 'node:test';
import assert from 'node:assert/strict';

import { amountScore, dateScore, descriptionScore, scorePair } from './scoring.ts';
import { DEFAULT_RECONCILIATION_CONFIG, resolveConfig } from './config.ts';

test('reconciliation/scoring', async (t) => {
  await t.test('identical descriptions score 100', () => {
    assert.equal(descriptionScore('Uber', 'uber'), 100);
  });

  await t.test('case 4 — a card descriptor still recognises the merchant', () => {
    assert.equal(descriptionScore('Uber', 'UBER *TRIP 93821'), 100);
    assert.ok(descriptionScore('Carrefour', 'MERPAGO*CARREFOUR 004631') >= 90);
  });

  await t.test('case 5 — unrelated merchants score low', () => {
    assert.ok(descriptionScore('Netflix', 'Carrefour') < 40);
    assert.ok(descriptionScore('Spotify', 'Est servicio alaminos') < 40);
  });

  await t.test('a shorter description contained in a longer one still scores well', () => {
    assert.ok(descriptionScore('carrefour', 'Carrefour cba colon') >= 70);
  });

  await t.test('date ladder', () => {
    assert.equal(dateScore('2026-08-28', '2026-08-28'), 100);
    assert.equal(dateScore('2026-08-29', '2026-08-28'), 90);
    assert.equal(dateScore('2026-08-30', '2026-08-28'), 78);
    assert.equal(dateScore('2026-09-02', '2026-08-28'), 38);
    // Past the window two same-merchant charges are more likely two purchases.
    assert.equal(dateScore('2026-09-05', '2026-08-28'), 0);
  });

  await t.test('date scoring is symmetric', () => {
    assert.equal(dateScore('2026-08-28', '2026-08-30'), dateScore('2026-08-30', '2026-08-28'));
  });

  await t.test('amount ladder', () => {
    assert.equal(amountScore(4752, 4752), 100);
    // The brief's example: $4.000 written down, $4.752 charged.
    assert.equal(amountScore(4752, 4000), 80);
    assert.equal(amountScore(10000, 1000), 0);
  });

  await t.test('case 1 — an exact match is high confidence', () => {
    const score = scorePair(
      { description: 'Uber', occurredOn: '2026-08-28', amount: 4752 },
      { description: 'Uber', occurredOn: '2026-08-28', amount: 4752 },
    );
    assert.equal(score.total, 100);
    assert.ok(score.total >= DEFAULT_RECONCILIATION_CONFIG.highConfidence);
  });

  await t.test('case 2 + 3 — the brief’s worked example lands in high confidence', () => {
    const score = scorePair(
      { description: 'UBER *TRIP', occurredOn: '2026-08-29', amount: 4752 },
      { description: 'Uber', occurredOn: '2026-08-28', amount: 4000 },
    );
    assert.deepEqual(
      { description: score.description, date: score.date, amount: score.amount },
      { description: 100, date: 90, amount: 80 },
    );
    assert.ok(score.total >= 90, `expected >= 90, got ${score.total}`);
  });

  await t.test('case 5 — a different merchant never reaches the review band', () => {
    const score = scorePair(
      { description: 'Carrefour', occurredOn: '2026-08-28', amount: 12000 },
      { description: 'Netflix', occurredOn: '2026-08-28', amount: 12000 },
    );
    assert.ok(score.total < DEFAULT_RECONCILIATION_CONFIG.reviewThreshold);
  });

  await t.test('weights are configurable without touching the scorers', () => {
    const config = resolveConfig({ weights: { description: 1, date: 0, amount: 0 } });
    const score = scorePair(
      { description: 'Uber', occurredOn: '2026-08-28', amount: 4752 },
      { description: 'Uber', occurredOn: '2026-01-01', amount: 999999 },
    );
    assert.ok(score.total < 60);
    const onDescription = scorePair(
      { description: 'Uber', occurredOn: '2026-08-28', amount: 4752 },
      { description: 'Uber', occurredOn: '2026-01-01', amount: 999999 },
      config,
    );
    assert.equal(onDescription.total, 100);
  });
});
