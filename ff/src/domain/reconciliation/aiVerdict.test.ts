import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyVerdicts, pairId, parseVerdicts, selectForAi } from './aiVerdict.ts';
import { DEFAULT_RECONCILIATION_CONFIG, resolveConfig } from './config.ts';
import { movementFingerprint } from './fingerprint.ts';
import type { MatchSuggestion } from './types.ts';

function suggestion(
  id: string,
  total: number,
  description: number,
): MatchSuggestion {
  return {
    movement: {
      id: `m${id}`,
      occurredOn: '2026-08-29',
      description: 'MERPAGO*XYZ 0012',
      amount: 4752,
      currency: 'ARS',
      direction: 'debit',
      kind: 'purchase',
      sourceReference: null,
      installmentCurrent: null,
      installmentTotal: null,
      cardLast4: '3377',
      fingerprint: `f${id}`,
      rawLine: '',
    },
    expense: {
      id: `e${id}`,
      occurredOn: '2026-08-28',
      description: 'Compra en el kiosco',
      amount: 4000,
      currency: 'ARS',
      category: 'other',
    },
    score: { description, date: 90, amount: 80, total },
    confidence: total >= 90 ? 'high' : 'review',
    source: 'deterministic',
    difference: 752,
  };
}

test('reconciliation/aiVerdict', async (t) => {
  await t.test('only ambiguous pairs are worth a model call', () => {
    const questions = selectForAi([
      suggestion('a', 96, 100), // the rules already settled it
      suggestion('b', 76, 40), // ambiguous *because of the text*
      suggestion('c', 74, 95), // ambiguous because of the amount, not the text
    ]);
    assert.deepEqual(questions.map((q) => q.id), ['mb:eb']);
  });

  await t.test('every amount anchor is worth asking about', () => {
    // The anchor is the case the model exists for: `nafta` and
    // `Est servicio alaminos` share no characters, so no amount of string
    // comparison connects them.
    const anchor: MatchSuggestion = {
      ...suggestion('n', 89, 0),
      source: 'amount-anchor',
    };
    const questions = selectForAi([anchor]);
    assert.deepEqual(questions.map((q) => q.id), ['mn:en']);
  });

  await t.test('the AI layer can be switched off entirely', () => {
    const questions = selectForAi(
      [suggestion('b', 76, 40)],
      resolveConfig({ ai: { ...DEFAULT_RECONCILIATION_CONFIG.ai, enabled: false } }),
    );
    assert.equal(questions.length, 0);
  });

  await t.test('a malformed verdict is dropped, never coerced', () => {
    assert.deepEqual(parseVerdicts({ verdicts: [{ id: 'x' }] }), []);
    assert.deepEqual(parseVerdicts({ verdicts: [{ id: 'x', match: 'yes', confidence: 1 }] }), []);
    assert.deepEqual(parseVerdicts({ verdicts: [{ match: true, confidence: 1 }] }), []);
    assert.deepEqual(parseVerdicts('not json at all'), []);
  });

  await t.test('a well-formed verdict is clamped and trimmed', () => {
    const [verdict] = parseVerdicts({
      verdicts: [{ id: 'x', match: true, confidence: 4.2, reason: '  ok  ', merchant: ' Uber ' }],
    });
    assert.deepEqual(verdict, { id: 'x', match: true, confidence: 1, reason: 'ok', merchant: 'Uber' });
  });

  await t.test('a confirmation raises the score into high confidence', () => {
    const pair = suggestion('b', 76, 40);
    const { suggestions } = applyVerdicts(
      [pair],
      [{ id: pairId(pair), match: true, confidence: 0.95, reason: 'Ambos son Uber', merchant: 'Uber' }],
    );
    assert.equal(suggestions.length, 1);
    assert.ok(suggestions[0].score.total > 76);
    assert.equal(suggestions[0].source, 'ai-confirmed');
    assert.equal(suggestions[0].reason, 'Ambos son Uber');
  });

  await t.test('a confident rejection removes the suggestion', () => {
    const pair = suggestion('b', 76, 40);
    const { suggestions, discarded } = applyVerdicts(
      [pair],
      [{ id: pairId(pair), match: false, confidence: 0.9, reason: 'Comercios distintos', merchant: null }],
    );
    assert.equal(suggestions.length, 0);
    assert.equal(discarded[0].source, 'ai-rejected');
  });

  await t.test('a pair the model did not answer keeps its deterministic score', () => {
    const pair = suggestion('b', 76, 40);
    const { suggestions } = applyVerdicts([pair], []);
    assert.deepEqual(suggestions[0].score, pair.score);
    assert.equal(suggestions[0].source, 'deterministic');
  });

  await t.test('the model can never promote a pair it was not asked about', () => {
    const asked = suggestion('b', 76, 40);
    const other = suggestion('c', 72, 30);
    const { suggestions } = applyVerdicts(
      [asked, other],
      [{ id: pairId(asked), match: true, confidence: 1, reason: '', merchant: null }],
    );
    assert.equal(suggestions.find((s) => s.expense.id === 'ec')?.score.total, 72);
  });
});

test('reconciliation/fingerprint', async (t) => {
  const base = {
    occurredOn: '2026-08-28',
    description: 'UBER *TRIP 45821',
    amount: 4752,
    currency: 'ARS',
    direction: 'debit',
    sourceReference: '004146',
    cardLast4: '3377',
    installmentCurrent: null,
  };

  await t.test('is stable across runs', () => {
    assert.equal(movementFingerprint(base), movementFingerprint({ ...base }));
  });

  await t.test('survives a reformatted descriptor', () => {
    // Normalized before hashing, so the issuer changing its own punctuation
    // does not turn an already-imported movement into a new one.
    assert.equal(
      movementFingerprint(base),
      movementFingerprint({ ...base, description: 'UBER*TRIP  45821' }),
    );
  });

  await t.test('separates two instalments of the same purchase', () => {
    assert.notEqual(
      movementFingerprint({ ...base, installmentCurrent: 3 }),
      movementFingerprint({ ...base, installmentCurrent: 4 }),
    );
  });

  await t.test('separates movements that differ by a cent', () => {
    assert.notEqual(movementFingerprint(base), movementFingerprint({ ...base, amount: 4752.01 }));
  });
});
