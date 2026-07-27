import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateExpression,
  guessCategory,
  matchesKeyword,
  normalizeNumber,
  parseEntry,
} from './parser.ts';

const TODAY = new Date(2026, 6, 23); // 2026-07-23, local time

const expense = (input: string, extra = {}) =>
  parseEntry(input, { type: 'expense', today: TODAY, ...extra });

const income = (input: string, extra = {}) =>
  parseEntry(input, { type: 'income', today: TODAY, ...extra });

// ─── expression evaluator ────────────────────────────────────────────────────

test('evaluates arithmetic without eval', () => {
  assert.equal(evaluateExpression('3*20'), 60);
  assert.equal(evaluateExpression('15+25'), 40);
  assert.equal(evaluateExpression('(2+3)*4'), 20);
  assert.equal(evaluateExpression('100/4'), 25);
  assert.equal(evaluateExpression('3 × 15'), 45);
  assert.equal(evaluateExpression('3x15'), 45);
});

test('rejects anything that is not plain arithmetic', () => {
  assert.equal(evaluateExpression('42'), null, 'no operator');
  assert.equal(evaluateExpression('alert(1)'), null);
  assert.equal(evaluateExpression('1+'), null);
  assert.equal(evaluateExpression('(1+2'), null);
  assert.equal(evaluateExpression('1/0'), null);
});

// ─── number normalization ────────────────────────────────────────────────────

test('normalizes ES and EN number formats', () => {
  assert.equal(normalizeNumber('1.234,56'), 1234.56);
  assert.equal(normalizeNumber('1,234.56'), 1234.56);
  assert.equal(normalizeNumber('1.234'), 1234);
  assert.equal(normalizeNumber('12.34'), 12.34);
  assert.equal(normalizeNumber('45.50'), 45.5);
  assert.equal(normalizeNumber('1500'), 1500);
});

// ─── keyword matching ────────────────────────────────────────────────────────

test('keyword matching is word-anchored but tolerates plurals', () => {
  assert.ok(matchesKeyword('3 coffees with the team', 'coffee'));
  assert.ok(matchesKeyword('compre pan', 'pan'));
  assert.ok(!matchesKeyword('pantalon nuevo', 'pan'), 'must not match inside a word');
  assert.ok(!matchesKeyword('gasolina', 'gas'));
});

// ─── categorization ──────────────────────────────────────────────────────────

test('categorizes English descriptions', () => {
  assert.equal(guessCategory('lunch with team', 'expense'), 'food');
  assert.equal(guessCategory('uber ride home', 'expense'), 'transport');
  assert.equal(guessCategory('monthly salary', 'income'), 'salary');
});

test('categorizes Spanish descriptions (H-4 fix)', () => {
  assert.equal(guessCategory('almuerzo con el equipo', 'expense'), 'food');
  assert.equal(guessCategory('super de la semana', 'expense'), 'groceries');
  assert.equal(guessCategory('nafta', 'expense'), 'transport');
  assert.equal(guessCategory('expensas del depto', 'expense'), 'bills');
  assert.equal(guessCategory('sueldo de julio', 'income'), 'salary');
});

test('falls back to other / other_income', () => {
  assert.equal(guessCategory('xyzzy', 'expense'), 'other');
  assert.equal(guessCategory('xyzzy', 'income'), 'other_income');
});

test('learnings win over the keyword dictionary', () => {
  const learnings = [{ keyword: 'uber', category: 'shopping' }];
  assert.equal(guessCategory('uber ride', 'expense'), 'transport');
  assert.equal(guessCategory('uber ride', 'expense', learnings), 'shopping');
});

// ─── end-to-end parsing ──────────────────────────────────────────────────────

test('parses "$20 lunch with team"', () => {
  const r = expense('$20 lunch with team');
  assert.equal(r?.amount, 20);
  assert.equal(r?.category, 'food');
  assert.equal(r?.description, 'lunch with team');
  assert.equal(r?.currency, 'ARS');
  assert.equal(r?.fxRate, 1);
  assert.equal(r?.date, '2026-07-23');
  assert.equal(r?.calculation, undefined);
});

test('parses a leading arithmetic expression', () => {
  const r = expense('3*15 reuniones café');
  assert.equal(r?.amount, 45);
  assert.equal(r?.calculation, '3*15');
  assert.equal(r?.category, 'food');
  assert.equal(r?.description, 'reuniones café');
});

test('parses a trailing amount', () => {
  const r = expense('supermercado 45.50');
  assert.equal(r?.amount, 45.5);
  assert.equal(r?.category, 'groceries');
});

test('parses ES thousands separators', () => {
  const r = expense('1.234,56 alquiler');
  assert.equal(r?.amount, 1234.56);
  assert.equal(r?.category, 'bills');
});

test('records USD entries with their rate instead of flattening them (H-3)', () => {
  const r = income('50 usd freelance', { usdRate: 1300 });
  assert.equal(r?.amount, 50);
  assert.equal(r?.currency, 'USD');
  assert.equal(r?.fxRate, 1300);
  assert.equal(r?.category, 'freelance');
});

test('refuses a USD entry when no rate is available', () => {
  assert.equal(income('50 usd freelance', { usdRate: null }), null);
});

test('returns null when there is no usable amount', () => {
  assert.equal(expense('asdf'), null);
  assert.equal(expense(''), null);
  assert.equal(expense('0 nada'), null);
});

test('falls back to the category name when no description remains', () => {
  const r = expense('$500');
  assert.equal(r?.amount, 500);
  assert.equal(r?.description, 'other');
});

test('keeps the raw input verbatim', () => {
  const r = expense('  3*20 cafés  ');
  assert.equal(r?.rawInput, '  3*20 cafés  ');
});
