import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatToolPartForDisplay,
  getReasoningFromParts,
  getTextFromParts,
  hasVisibleAssistantContent,
  getToolApproval,
  getToolError,
  getToolInput,
  getToolOutput,
  isToolPart,
  normalizeMessageParts,
} from '../lib/chat/message-parts';

test('normalizeMessageParts uses fallback content when parts are missing', () => {
  const parts = normalizeMessageParts(undefined, 'hello world');
  assert.deepEqual(parts, [{ type: 'text', text: 'hello world' }]);
});

test('getTextFromParts concatenates text parts and skips non-text payloads', () => {
  const text = getTextFromParts([
    { type: 'text', text: 'alpha' },
    { type: 'reasoning', text: 'hidden-thoughts' },
    { type: 'file', url: 'https://example.com/file.pdf', mediaType: 'application/pdf' },
    { type: 'tool-demo', state: 'output-available', output: {} },
    { type: 'text', text: 'beta' },
  ]);

  assert.equal(text, 'alpha\nbeta');
});

test('getTextFromParts returns empty text for reasoning-only payloads', () => {
  const text = getTextFromParts([
    { type: 'reasoning', text: 'first pass' },
    { type: 'reasoning', text: 'second pass' },
  ]);

  assert.equal(text, '');
});

test('getReasoningFromParts concatenates reasoning parts and skips non-reasoning payloads', () => {
  const reasoning = getReasoningFromParts([
    { type: 'reasoning', text: 'first pass' },
    { type: 'text', text: 'final answer' },
    { type: 'reasoning', text: 'second pass' },
    { type: 'file', url: 'https://example.com/file.pdf', mediaType: 'application/pdf' },
  ]);

  assert.equal(reasoning, 'first pass\nsecond pass');
});

test('hasVisibleAssistantContent is true for streaming reasoning part without text yet', () => {
  const visible = hasVisibleAssistantContent({
    role: 'assistant',
    parts: [{ type: 'reasoning', text: '', state: 'streaming' }],
  });

  assert.equal(visible, true);
});

test('isToolPart detects static and dynamic tool parts', () => {
  assert.equal(isToolPart({ type: 'tool-getPolicySummary' }), true);
  assert.equal(isToolPart({ type: 'dynamic-tool', toolName: 'search' }), true);
  assert.equal(isToolPart({ type: 'text', text: 'hello' }), false);
});

test('tool parsing extracts input output and approval fields', () => {
  const part = {
    type: 'tool-getPolicySummary',
    state: 'output-available',
    input: { limit: 10 },
    output: { totalRules: 3 },
    approval: { id: 'appr_123', approved: true },
  };

  assert.deepEqual(getToolInput(part), { limit: 10 });
  assert.deepEqual(getToolOutput(part), { totalRules: 3 });
  assert.deepEqual(getToolApproval(part), { id: 'appr_123', approved: true });
});

test('getToolError handles explicit errors and denied approvals', () => {
  assert.equal(
    getToolError({
      type: 'tool-getRecentAuditEvents',
      state: 'output-error',
      input: { limit: 20 },
      errorText: 'Upstream timeout',
    }),
    'Upstream timeout',
  );

  assert.equal(
    getToolError({
      type: 'tool-createApprovalDraft',
      state: 'output-denied',
      input: { action: 'deploy' },
      approval: { id: 'appr_999', approved: false, reason: 'Not authorized' },
    }),
    'Not authorized',
  );
});

test('formatToolPartForDisplay returns structured text for output parts', () => {
  const formatted = formatToolPartForDisplay({
    type: 'tool-getPolicySummary',
    state: 'output-available',
    input: { limit: 2 },
    output: { enabledRules: 2, rules: [{ id: 'r1' }] },
  });

  assert.equal(formatted.label, 'getPolicySummary');
  assert.equal(formatted.state, 'output-available');
  assert.equal(formatted.errorText, null);
  assert.equal(typeof formatted.inputText, 'string');
  assert.equal(typeof formatted.outputText, 'string');
  assert.match(formatted.inputText ?? '', /"limit": 2/);
  assert.match(formatted.outputText ?? '', /"enabledRules": 2/);
});

test('formatToolPartForDisplay handles malformed tool parts safely', () => {
  const formatted = formatToolPartForDisplay({
    type: 'tool-badPart',
    state: 'output-error',
  });

  assert.equal(formatted.label, 'badPart');
  assert.equal(formatted.state, 'output-error');
  assert.equal(formatted.inputText, null);
  assert.equal(formatted.outputText, null);
  assert.equal(formatted.errorText, null);
});
