import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { chartFill, hexToHsl } from './color.ts';

test('reads hex into hsl', () => {
  assert.deepEqual(hexToHsl('#ffffff'), { h: 0, s: 0, l: 100 });
  const red = hexToHsl('#ff0000');
  assert.equal(Math.round(red.h), 0);
  assert.equal(Math.round(red.s), 100);
  assert.equal(Math.round(red.l), 50);
  const blue = hexToHsl('#3b82f6');
  assert.equal(Math.round(blue.h), 217);
});

test('expands shorthand hex', () => {
  assert.deepEqual(hexToHsl('#fff'), hexToHsl('#ffffff'));
});

test('chart fills cap saturation so every slice reads the same weight', () => {
  // Orange and blue are the two that used to fight each other hardest.
  assert.equal(chartFill('#f97316'), 'hsl(25 46% 56%)');
  assert.equal(chartFill('#3b82f6'), 'hsl(217 46% 56%)');
});

test('an already-muted colour keeps its lower saturation', () => {
  assert.equal(chartFill('#64748b'), 'hsl(215 16% 56%)');
});
