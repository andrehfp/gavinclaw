import assert from 'node:assert/strict';
import test from 'node:test';
import { READ_ROLES, WRITE_ROLES, hasRole, normalizeRoleClaim } from '../lib/rbac';

test('user can access read endpoints', () => {
  assert.equal(hasRole('user', READ_ROLES), true);
});

test('user can access write endpoints', () => {
  assert.equal(hasRole('user', WRITE_ROLES), true);
});

test('admin can access write endpoints', () => {
  assert.equal(hasRole('admin', WRITE_ROLES), true);
});

test('legacy role aliases normalize to admin/user', () => {
  assert.equal(normalizeRoleClaim('owner'), 'admin');
  assert.equal(normalizeRoleClaim('analyst'), 'user');
  assert.equal(normalizeRoleClaim('viewer'), 'user');
  assert.equal(normalizeRoleClaim('member'), 'user');
});
