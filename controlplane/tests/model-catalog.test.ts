import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CHAT_MODEL,
  getChatModelOption,
  modelSupportsReasoning,
  modelSupportsToolCalling,
} from '../lib/ai/model-catalog';

test('getChatModelOption resolves known model ids', () => {
  const model = getChatModelOption(DEFAULT_CHAT_MODEL);
  assert.ok(model);
  assert.equal(model?.id, DEFAULT_CHAT_MODEL);
  assert.equal(getChatModelOption('openai:gpt-5.2')?.id, 'openai:gpt-5.2');
});

test('getChatModelOption returns null for unknown ids', () => {
  const model = getChatModelOption('unknown-provider:unknown-model');
  assert.equal(model, null);
});

test('modelSupportsToolCalling follows catalog capability flags', () => {
  assert.equal(modelSupportsToolCalling('openai:gpt-4.1-mini'), true);
  assert.equal(modelSupportsToolCalling('openai:gpt-5.2-pro'), true);
  assert.equal(modelSupportsToolCalling('openai:gpt-image-1.5'), false);
});

test('modelSupportsToolCalling is false for unknown and blank ids', () => {
  assert.equal(modelSupportsToolCalling('unknown-provider:unknown-model'), false);
  assert.equal(modelSupportsToolCalling('   '), false);
});

test('modelSupportsReasoning follows catalog capability flags', () => {
  assert.equal(modelSupportsReasoning('openai:gpt-4.1-mini'), false);
  assert.equal(modelSupportsReasoning('openai:gpt-5.2-pro'), true);
});

test('modelSupportsReasoning is false for unknown and blank ids', () => {
  assert.equal(modelSupportsReasoning('unknown-provider:unknown-model'), false);
  assert.equal(modelSupportsReasoning('   '), false);
});
