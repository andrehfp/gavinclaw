import assert from 'node:assert/strict';
import test from 'node:test';
import type { UIMessage } from 'ai';
import { shouldAutoContinueAfterApproval } from '../lib/chat/approval';

function assistantMessage(parts: unknown[]): UIMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    parts,
  };
}

test('auto-continue is enabled after approved tool response', () => {
  const shouldContinue = shouldAutoContinueAfterApproval([
    assistantMessage([
      {
        type: 'tool-createApprovalDraft',
        state: 'approval-responded',
        approval: { approved: true },
      },
    ]),
  ]);

  assert.equal(shouldContinue, true);
});

test('auto-continue remains disabled after denied approval', () => {
  const shouldContinue = shouldAutoContinueAfterApproval([
    assistantMessage([
      {
        type: 'tool-createApprovalDraft',
        state: 'approval-responded',
        approval: { approved: false },
      },
    ]),
  ]);

  assert.equal(shouldContinue, false);
});

