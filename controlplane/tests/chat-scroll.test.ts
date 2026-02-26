import assert from 'node:assert/strict';
import test from 'node:test';
import { getDistanceFromBottom, isScrolledNearBottom } from '../lib/chat/scroll';

test('getDistanceFromBottom clamps to zero for overscroll', () => {
  const distance = getDistanceFromBottom({
    clientHeight: 400,
    scrollHeight: 1000,
    scrollTop: 700,
  });

  assert.equal(distance, 0);
});

test('isScrolledNearBottom returns true when exactly at bottom', () => {
  const nearBottom = isScrolledNearBottom(
    {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 600,
    },
    96,
  );

  assert.equal(nearBottom, true);
});

test('isScrolledNearBottom returns true inside threshold', () => {
  const nearBottom = isScrolledNearBottom(
    {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 540,
    },
    96,
  );

  assert.equal(nearBottom, true);
});

test('isScrolledNearBottom returns false outside threshold', () => {
  const nearBottom = isScrolledNearBottom(
    {
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 500,
    },
    96,
  );

  assert.equal(nearBottom, false);
});
