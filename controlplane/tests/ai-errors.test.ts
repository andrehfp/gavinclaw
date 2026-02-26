import assert from 'node:assert/strict';
import test from 'node:test';
import { toUserFacingStreamError } from '../lib/ai/errors';

test('toUserFacingStreamError surfaces missing provider key errors', () => {
  const error = new Error('ANTHROPIC_API_KEY is required to use Anthropic models');
  assert.equal(toUserFacingStreamError(error), 'ANTHROPIC_API_KEY is required to use Anthropic models');
});

test('toUserFacingStreamError normalizes auth failures', () => {
  const error = new Error('401 Unauthorized');
  assert.equal(
    toUserFacingStreamError(error),
    'AI provider authentication failed for the selected model. Check the API key.',
  );
});

test('toUserFacingStreamError normalizes rate limit failures', () => {
  const error = new Error('429 rate limit exceeded');
  assert.equal(toUserFacingStreamError(error), 'AI provider rate limit reached. Try again in a moment.');
});

test('toUserFacingStreamError falls back for unknown errors', () => {
  const error = new Error('Socket hang up');
  assert.equal(toUserFacingStreamError(error), 'The assistant could not complete this response.');
});

test('toUserFacingStreamError surfaces provider diagnostics in development', () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';

  try {
    const error = new Error('model_not_found');
    assert.equal(toUserFacingStreamError(error), 'model_not_found');
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});
