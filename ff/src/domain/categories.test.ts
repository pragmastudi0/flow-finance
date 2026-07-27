import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_KEYWORDS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  findDuplicateKeywords,
  fold,
} from './categories.ts';

test('folds accents and case', () => {
  assert.equal(fold('Café'), 'cafe');
  assert.equal(fold('ALMACÉN'), 'almacen');
  assert.equal(fold('Ñandú'), 'nandu');
});

test('no keyword is claimed by two categories on the same side', () => {
  assert.deepEqual(findDuplicateKeywords(), []);
});

test('every category has a color and an icon', () => {
  for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
    assert.ok(CATEGORY_COLORS[c], `${c} sin color`);
    assert.ok(CATEGORY_ICONS[c], `${c} sin icono`);
  }
});

test('every category except the fallbacks has keywords', () => {
  for (const c of [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]) {
    if (c === 'other') continue;
    assert.ok((CATEGORY_KEYWORDS[c] ?? []).length > 0, `${c} sin keywords`);
  }
});

test('keywords are stored unaccented and lowercase', () => {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      assert.equal(kw, fold(kw), `"${kw}" en ${category} deberia estar sin tildes y en minuscula`);
    }
  }
});
