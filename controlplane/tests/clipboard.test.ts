import assert from 'node:assert/strict';
import test from 'node:test';
import { copyTextToClipboard } from '../lib/chat/clipboard';

function mockNavigatorClipboard(writeText: (text: string) => Promise<void>): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText,
      },
    },
  });

  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'navigator', original);
      return;
    }

    delete (globalThis as { navigator?: unknown }).navigator;
  };
}

test('copyTextToClipboard returns false when text is empty', async () => {
  assert.equal(await copyTextToClipboard(''), false);
});

test('copyTextToClipboard returns true when clipboard write succeeds', async (t) => {
  let copiedValue = '';
  const restore = mockNavigatorClipboard(async (text) => {
    copiedValue = text;
  });
  t.after(restore);

  assert.equal(await copyTextToClipboard('alpha beta'), true);
  assert.equal(copiedValue, 'alpha beta');
});

test('copyTextToClipboard returns false when clipboard write throws', async (t) => {
  const restore = mockNavigatorClipboard(async () => {
    throw new Error('permission denied');
  });
  t.after(restore);

  assert.equal(await copyTextToClipboard('alpha'), false);
});
