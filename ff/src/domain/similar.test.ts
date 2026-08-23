import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findSimilarTransactions, keyTokens, suggestKeyword } from './similar.ts';
import type { Transaction } from '../types/models.ts';

let seq = 0;
function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: String(++seq),
    type: 'expense',
    amount: 1000,
    currency: 'ARS',
    fxRate: 1,
    category: 'other',
    description: '',
    occurredOn: '2026-08-01',
    rawInput: null,
    calculation: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

describe('keyTokens', () => {
  it('folds accents and case', () => {
    assert.deepEqual(keyTokens('Café'), ['cafe']);
    assert.deepEqual(keyTokens('CAFÉ'), keyTokens('cafe'));
  });

  it('drops numbers, short fragments and stopwords', () => {
    assert.deepEqual(keyTokens('1200 cafe de la esquina'), ['cafe', 'esquina']);
  });

  it('keeps three-letter words that carry meaning', () => {
    assert.deepEqual(keyTokens('pago de luz'), ['pago', 'luz']);
  });

  it('deduplicates', () => {
    assert.deepEqual(keyTokens('cafe cafe cafe'), ['cafe']);
  });

  it('returns nothing for a text with no usable word', () => {
    assert.deepEqual(keyTokens('12 de 34'), []);
  });
});

describe('findSimilarTransactions', () => {
  const target = tx({ description: 'café', rawInput: '1200 café', category: 'food' });

  it('finds the ones sharing a word', () => {
    const all = [
      target,
      tx({ description: 'café con leche' }),
      tx({ description: 'Uber al trabajo' }),
      tx({ description: 'Coto' }),
    ];

    const found = findSimilarTransactions(target, all, 'Café');
    assert.deepEqual(found.map((m) => m.transaction.description), ['café con leche']);
    assert.deepEqual(found[0]?.sharedTokens, ['cafe']);
  });

  it('never returns the transaction being recategorized', () => {
    const found = findSimilarTransactions(target, [target], 'Café');
    assert.deepEqual(found, []);
  });

  it('skips the ones already in the destination category', () => {
    const all = [target, tx({ description: 'café de ayer', category: 'Café' })];
    assert.deepEqual(findSimilarTransactions(target, all, 'Café'), []);
  });

  it('compares the destination without caring about case or accents', () => {
    const all = [target, tx({ description: 'otro café', category: 'cafe' })];
    assert.deepEqual(findSimilarTransactions(target, all, 'Café'), []);
  });

  it('stays on the same side: an income named café is not an expense', () => {
    const all = [target, tx({ description: 'venta de café', type: 'income' })];
    assert.deepEqual(findSimilarTransactions(target, all, 'Café'), []);
  });

  it('matches on rawInput when the description was edited by hand', () => {
    const all = [target, tx({ description: 'Bar de la esquina', rawInput: '900 cafe' })];
    const found = findSimilarTransactions(target, all, 'Café');
    assert.deepEqual(found.map((m) => m.sharedTokens), [['cafe']]);
  });

  it('puts the strongest matches first, then the most recent', () => {
    const barTarget = tx({ description: 'café del bar', category: 'food' });
    const all = [
      barTarget,
      tx({ description: 'café', occurredOn: '2026-07-01' }),
      tx({ description: 'café', occurredOn: '2026-08-05' }),
      tx({ description: 'café en el bar', occurredOn: '2026-06-01' }),
    ];

    const found = findSimilarTransactions(barTarget, all, 'Café');
    assert.deepEqual(
      found.map((m) => [m.transaction.description, m.transaction.occurredOn]),
      [
        ['café en el bar', '2026-06-01'], // shares two words, so it leads
        ['café', '2026-08-05'],
        ['café', '2026-07-01'],
      ],
    );
  });

  it('returns nothing when the target has no usable word', () => {
    const empty = tx({ description: '', rawInput: null });
    assert.deepEqual(findSimilarTransactions(empty, [empty, tx({ description: 'café' })], 'Café'), []);
  });
});

describe('suggestKeyword', () => {
  const target = tx({ description: 'café con leche' });

  it('picks the word shared by the most matches', () => {
    const matches = [
      { transaction: tx(), sharedTokens: ['cafe'] },
      { transaction: tx(), sharedTokens: ['cafe', 'leche'] },
      { transaction: tx(), sharedTokens: ['cafe'] },
    ];
    assert.equal(suggestKeyword(target, matches), 'cafe');
  });

  it('breaks a tie with the longer word', () => {
    const matches = [{ transaction: tx(), sharedTokens: ['bar', 'panaderia'] }];
    assert.equal(suggestKeyword(target, matches), 'panaderia');
  });

  it('falls back to the target own first word with no matches', () => {
    assert.equal(suggestKeyword(target, []), 'cafe');
  });

  it('returns null when there is nothing to learn', () => {
    assert.equal(suggestKeyword(tx({ description: '' }), []), null);
  });
});
