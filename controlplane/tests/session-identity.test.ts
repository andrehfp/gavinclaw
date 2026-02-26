import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveIdentityClaims } from '../lib/server/domain/session';

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildToken(payload: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${header}.${body}.`;
}

test('deriveIdentityClaims marks explicit organization from hints', () => {
  const token = buildToken({ sub: 'user_123' });

  const claims = deriveIdentityClaims(
    token,
    { email: 'admin@example.com' },
    {
      organizationId: 'org_abc',
      role: 'owner',
      roles: undefined,
    },
  );

  assert.equal(claims.subject, 'user_123');
  assert.equal(claims.orgId, 'org_abc');
  assert.equal(claims.roleFromClaims, 'admin');
  assert.equal(claims.hasExplicitOrganization, true);
});

test('deriveIdentityClaims falls back to personal organization when no org claim exists', () => {
  const token = buildToken({ sub: 'user_999', email: 'viewer@example.com' });

  const claims = deriveIdentityClaims(token, { firstName: 'Viewer' }, {});

  assert.equal(claims.subject, 'user_999');
  assert.equal(claims.orgId, 'personal_user_999');
  assert.equal(claims.hasExplicitOrganization, false);
  assert.equal(claims.roleFromClaims, null);
});
