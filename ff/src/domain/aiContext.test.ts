import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AI_CONTEXT_MAX, sanitizeAiContext } from './aiContext.ts';

describe('sanitizeAiContext', () => {
  it('trims surrounding whitespace', () => {
    assert.equal(sanitizeAiContext('  vendo tecnología  '), 'vendo tecnología');
  });

  it('clamps to the maximum length', () => {
    assert.equal(sanitizeAiContext('a'.repeat(AI_CONTEXT_MAX + 50)).length, AI_CONTEXT_MAX);
  });

  it('collapses non-strings and blank text to empty', () => {
    assert.equal(sanitizeAiContext(undefined), '');
    assert.equal(sanitizeAiContext({ text: 'hola' }), '');
    assert.equal(sanitizeAiContext('   \n  '), '');
  });
});
