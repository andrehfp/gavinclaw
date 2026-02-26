import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNotRemovingLastActiveAdmin } from '../lib/server/admin/members';

test('blocks demoting the last active admin', () => {
  assert.throws(
    () => {
      assertNotRemovingLastActiveAdmin({
        memberships: [
          { id: 'm1', role: 'admin', status: 'active' },
          { id: 'm2', role: 'user', status: 'active' },
        ],
        targetMembershipId: 'm1',
        nextRole: 'user',
      });
    },
    /At least one active admin must remain/,
  );
});

test('allows demoting when another active admin exists', () => {
  assert.doesNotThrow(() => {
    assertNotRemovingLastActiveAdmin({
      memberships: [
        { id: 'm1', role: 'admin', status: 'active' },
        { id: 'm2', role: 'admin', status: 'active' },
      ],
      targetMembershipId: 'm1',
      nextRole: 'user',
    });
  });
});

test('blocks removing the last active admin', () => {
  assert.throws(
    () => {
      assertNotRemovingLastActiveAdmin({
        memberships: [
          { id: 'm1', role: 'admin', status: 'active' },
        ],
        targetMembershipId: 'm1',
      });
    },
    /At least one active admin must remain/,
  );
});
