import { test } from 'node:test';
import assert from 'node:assert/strict';

import { descriptionTokens, merchantLabel, normalizeDescription } from './normalize.ts';

test('reconciliation/normalize', async (t) => {
  await t.test('strips the operation number from a card descriptor', () => {
    assert.equal(normalizeDescription('UBER *TRIP 45821'), 'uber');
  });

  await t.test('strips the legal form', () => {
    assert.equal(normalizeDescription('UBER BV'), 'uber');
  });

  await t.test('strips the payment processor prefix', () => {
    assert.equal(normalizeDescription('MERPAGO*CARREFOUR'), 'carrefour');
    assert.equal(normalizeDescription('Payu*ar*uber'), 'uber');
    assert.equal(normalizeDescription('DL*SPOTIFY'), 'spotify');
  });

  await t.test('folds case and accents', () => {
    assert.equal(normalizeDescription('Café Martínez'), normalizeDescription('CAFE MARTINEZ'));
  });

  await t.test('drops the reference blob but keeps the merchant', () => {
    assert.equal(normalizeDescription('Facebk *dpxdvym2k2'), 'facebk');
    assert.equal(normalizeDescription('Apple.com/bill mx5xsyg7k'), 'apple');
  });

  await t.test('never collapses a descriptor to nothing', () => {
    // Every token is noise; keeping one beats scoring 0 against everything.
    assert.notEqual(normalizeDescription('PAYU*AR*'), '');
    assert.notEqual(normalizeDescription('000053'), '');
  });

  await t.test('a merchant that *is* a processor survives', () => {
    assert.equal(normalizeDescription('Mercado Pago'), 'mercado pago');
  });

  await t.test('keeps multi-word merchants', () => {
    assert.deepEqual(descriptionTokens('Carrefour cba colon'), ['carrefour', 'cba', 'colon']);
  });

  await t.test('produces a display label', () => {
    assert.equal(merchantLabel('PAYU*AR*UBER 004146'), 'Uber');
    assert.equal(merchantLabel('MERPAGO*CARREFOUR'), 'Carrefour');
  });
});
