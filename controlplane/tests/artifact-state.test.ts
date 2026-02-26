import assert from 'node:assert/strict';
import test from 'node:test';
import type { DataUIPart } from 'ai';
import { applyArtifactDataPart, initialArtifactStreamState } from '../lib/chat/artifact-state';
import type { ChatMessageDataParts } from '../lib/chat/types';

function asDataPart(part: DataUIPart<ChatMessageDataParts>): DataUIPart<ChatMessageDataParts> {
  return part;
}

test('applyArtifactDataPart updates state across artifact stream lifecycle', () => {
  const withId = applyArtifactDataPart(initialArtifactStreamState, asDataPart({ type: 'data-id', data: 'a1' }));
  assert.equal(withId.activeArtifactId, 'a1');
  assert.equal(withId.isOpen, true);
  assert.equal(withId.isStreaming, true);

  const withKind = applyArtifactDataPart(withId, asDataPart({ type: 'data-kind', data: 'text' }));
  assert.equal(withKind.activeKind, 'text');

  const withTitle = applyArtifactDataPart(withKind, asDataPart({ type: 'data-title', data: 'Policy summary' }));
  assert.equal(withTitle.activeTitle, 'Policy summary');

  const withClear = applyArtifactDataPart(withTitle, asDataPart({ type: 'data-clear', data: null }));
  assert.equal(withClear.streamingContent, '');

  const withTextDelta = applyArtifactDataPart(
    withClear,
    asDataPart({ type: 'data-textDelta', data: 'hello' }),
  );
  const withCodeDelta = applyArtifactDataPart(
    withTextDelta,
    asDataPart({ type: 'data-codeDelta', data: ' world' }),
  );
  assert.equal(withCodeDelta.streamingContent, 'hello world');

  const finished = applyArtifactDataPart(
    withCodeDelta,
    asDataPart({ type: 'data-finish', data: { artifactId: 'a1', version: 2 } }),
  );
  assert.equal(finished.isStreaming, false);
});

test('applyArtifactDataPart ignores malformed payloads', () => {
  const afterInvalidId = applyArtifactDataPart(
    initialArtifactStreamState,
    asDataPart({ type: 'data-id', data: '' }),
  );
  assert.deepEqual(afterInvalidId, initialArtifactStreamState);

  const afterInvalidKind = applyArtifactDataPart(
    initialArtifactStreamState,
    asDataPart({ type: 'data-kind', data: 'sheet' as unknown as 'text' }),
  );
  assert.deepEqual(afterInvalidKind, initialArtifactStreamState);
});
