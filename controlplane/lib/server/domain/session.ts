import type { PoolClient } from 'pg';
import { normalizeRoleClaim, type Role } from '@/lib/rbac';
import { getDbPool } from '@/lib/server/db/pool';
import { resolveActiveOrganizationContextForUser, WorkOSProvisioningError } from '@/lib/server/workos/provisioning';

type IdentityClaims = {
  subject: string;
  email: string | null;
  name: string | null;
  orgId: string;
  orgName: string;
  roleFromClaims: Role | null;
  hasExplicitOrganization: boolean;
};

type SessionHints = {
  organizationId?: string | null;
  role?: string | null;
  roles?: string[] | null;
};

type AuthSessionUser = Record<string, unknown>;

type UserRow = {
  id: string;
  external_id: string;
  email: string | null;
  name: string | null;
};

type OrganizationRow = {
  id: string;
  external_id: string;
  name: string;
};

type MembershipRow = {
  id: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  source: 'workos' | 'local';
  external_role: string | null;
};

type FallbackContext = {
  orgId: string;
  orgName: string;
  role: Role;
};

export class SessionContextError extends Error {
  code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL';

  constructor(code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INTERNAL', message: string) {
    super(message);
    this.code = code;
  }
}

export type PostgresSessionContext = {
  actorUserId: string;
  actorEmail: string | null;
  orgId: string;
  orgName: string;
  role: Role;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4;
  const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
  return Buffer.from(padded, 'base64').toString('utf8');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    return {};
  }

  try {
    const payloadText = decodeBase64Url(parts[1]);
    const parsed = JSON.parse(payloadText) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function roleFromClaims(payload: Record<string, unknown>, hints: SessionHints): Role | null {
  const directRole = asString(payload.role) ?? asString(hints.role);
  if (directRole) {
    const normalizedDirectRole = normalizeRoleClaim(directRole);
    if (normalizedDirectRole) {
      return normalizedDirectRole;
    }
  }

  const claimRoles = Array.isArray(payload.roles)
    ? payload.roles
    : Array.isArray(hints.roles)
      ? hints.roles
      : [];

  for (const candidate of claimRoles) {
    if (typeof candidate === 'string') {
      const normalizedCandidate = normalizeRoleClaim(candidate);
      if (normalizedCandidate) {
        return normalizedCandidate;
      }
    }
  }

  return null;
}

function fullNameFromUser(user: AuthSessionUser): string | null {
  const preferred = asString(user.name);
  if (preferred) {
    return preferred;
  }

  const firstName = asString(user.firstName);
  const lastName = asString(user.lastName);
  const composed = [firstName, lastName].filter((part) => part !== null).join(' ').trim();
  return composed.length > 0 ? composed : null;
}

export function deriveIdentityClaims(accessToken: string, sessionUser: AuthSessionUser, hints: SessionHints): IdentityClaims {
  const jwtPayload = decodeJwtPayload(accessToken);

  const subject =
    asString(jwtPayload.sub) ??
    asString(sessionUser.id) ??
    asString(sessionUser.userId) ??
    asString(sessionUser.externalId);

  if (!subject) {
    throw new SessionContextError('UNAUTHENTICATED', 'Authenticated user is missing a stable subject identifier');
  }

  const email = asString(jwtPayload.email) ?? asString(sessionUser.email);
  const name = asString(jwtPayload.name) ?? fullNameFromUser(sessionUser);

  const explicitOrgId =
    asString(jwtPayload.org_id) ??
    asString(jwtPayload.organization_id) ??
    asString(jwtPayload.organizationId) ??
    asString(hints.organizationId) ??
    asString(sessionUser.org_id) ??
    asString(sessionUser.organization_id) ??
    asString(sessionUser.organizationId);

  const orgId = explicitOrgId ?? `personal_${subject}`;

  const orgName =
    asString(jwtPayload.org_name) ??
    asString(jwtPayload.organization_name) ??
    asString(sessionUser.org_name) ??
    asString(sessionUser.organization_name) ??
    `Workspace ${subject.slice(0, 8)}`;

  return {
    subject,
    email,
    name,
    orgId,
    orgName,
    roleFromClaims: roleFromClaims(jwtPayload, hints),
    hasExplicitOrganization: explicitOrgId !== null,
  };
}

async function upsertUser(client: PoolClient, claims: IdentityClaims): Promise<UserRow> {
  const result = await client.query<UserRow>(
    `
      INSERT INTO users (external_id, email, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (external_id)
      DO UPDATE
      SET email = COALESCE(EXCLUDED.email, users.email),
          name = COALESCE(EXCLUDED.name, users.name),
          updated_at = NOW()
      RETURNING id, external_id, email, name
    `,
    [claims.subject, claims.email, claims.name],
  );

  const row = result.rows[0];
  if (!row) {
    throw new SessionContextError('INTERNAL', 'Could not upsert user session context');
  }

  return row;
}

async function upsertOrganization(client: PoolClient, claims: IdentityClaims): Promise<OrganizationRow> {
  const isPersonal = claims.orgId.startsWith('personal_');

  const result = await client.query<OrganizationRow>(
    `
      INSERT INTO organizations (external_id, name, is_personal)
      VALUES ($1, $2, $3)
      ON CONFLICT (external_id)
      DO UPDATE
      SET name = CASE WHEN organizations.is_personal THEN organizations.name ELSE EXCLUDED.name END,
          updated_at = NOW()
      RETURNING id, external_id, name
    `,
    [claims.orgId, isPersonal ? `Personal workspace (${claims.subject.slice(0, 8)})` : claims.orgName, isPersonal],
  );

  const row = result.rows[0];
  if (!row) {
    throw new SessionContextError('INTERNAL', 'Could not upsert organization session context');
  }

  return row;
}

async function updateMembership(
  client: PoolClient,
  membershipId: string,
  patch: Partial<{ role: Role; status: 'active'; source: 'workos'; externalRole: string }>,
): Promise<MembershipRow> {
  const role = patch.role ?? null;
  const status = patch.status ?? null;
  const source = patch.source ?? null;
  const externalRole = patch.externalRole ?? null;

  const result = await client.query<MembershipRow>(
    `
      UPDATE memberships
      SET role = COALESCE($2::membership_role, role),
          status = COALESCE($3::membership_status, status),
          source = COALESCE($4::membership_source, source),
          external_role = CASE
            WHEN $5::text IS NULL THEN external_role
            ELSE $5::text
          END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, role, status, source, external_role
    `,
    [membershipId, role, status, source, externalRole],
  );

  const row = result.rows[0];
  if (!row) {
    throw new SessionContextError('INTERNAL', 'Could not update membership context');
  }

  return row;
}

async function upsertMembership(
  client: PoolClient,
  orgId: string,
  userId: string,
  claims: IdentityClaims,
): Promise<MembershipRow> {
  const claimRole = claims.roleFromClaims;
  if (!claimRole) {
    throw new SessionContextError(
      'FORBIDDEN',
      'No WorkOS role found in session claims. Configure role/roles in WorkOS for this user and organization.',
    );
  }

  const existing = await client.query<MembershipRow>(
    `
      SELECT id, role, status, source, external_role
      FROM memberships
      WHERE org_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [orgId, userId],
  );

  const current = existing.rows[0];
  if (current) {
    if (
      current.role !== claimRole
      || current.source !== 'workos'
      || current.external_role !== claimRole
      || current.status !== 'active'
    ) {
      return updateMembership(client, current.id, {
        role: claimRole,
        status: 'active',
        source: 'workos',
        externalRole: claimRole,
      });
    }

    return current;
  }

  const inserted = await client.query<MembershipRow>(
    `
      INSERT INTO memberships (org_id, user_id, role, status, source, external_role)
      VALUES ($1, $2, $3::membership_role, 'active'::membership_status, $4::membership_source, $5)
      RETURNING id, role, status, source, external_role
    `,
    [orgId, userId, claimRole, 'workos', claimRole],
  );

  const row = inserted.rows[0];
  if (!row) {
    throw new SessionContextError('INTERNAL', 'Could not create membership context');
  }

  return row;
}

async function findFallbackContextFromPostgres(client: PoolClient, subject: string): Promise<FallbackContext | null> {
  const result = await client.query<{
    org_external_id: string;
    org_name: string;
    role: Role;
  }>(
    `
      SELECT
        o.external_id AS org_external_id,
        o.name AS org_name,
        m.role
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      JOIN organizations o ON o.id = m.org_id
      WHERE u.external_id = $1
        AND m.status = 'active'::membership_status
        AND m.source = 'workos'::membership_source
      ORDER BY m.updated_at DESC
      LIMIT 1
    `,
    [subject],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    orgId: row.org_external_id,
    orgName: row.org_name,
    role: row.role,
  };
}

async function resolveFallbackContext(client: PoolClient, claims: IdentityClaims): Promise<FallbackContext | null> {
  const fromPostgres = await findFallbackContextFromPostgres(client, claims.subject);
  if (fromPostgres) {
    return fromPostgres;
  }

  try {
    const fromWorkOS = await resolveActiveOrganizationContextForUser(claims.subject);
    if (!fromWorkOS) {
      return null;
    }

    return {
      orgId: fromWorkOS.orgId,
      orgName: fromWorkOS.orgName,
      role: fromWorkOS.role,
    };
  } catch (error) {
    if (error instanceof WorkOSProvisioningError) {
      return null;
    }

    return null;
  }
}

function applyFallbackContext(claims: IdentityClaims, fallback: FallbackContext): IdentityClaims {
  return {
    ...claims,
    orgId: fallback.orgId,
    orgName: fallback.orgName,
    roleFromClaims: fallback.role,
    hasExplicitOrganization: true,
  };
}

export async function ensurePostgresSessionContext(input: {
  accessToken: string;
  user: unknown;
  organizationId?: string;
  role?: string;
  roles?: string[];
}): Promise<PostgresSessionContext> {
  const initialClaims = deriveIdentityClaims(input.accessToken, isRecord(input.user) ? input.user : {}, {
    organizationId: input.organizationId,
    role: input.role,
    roles: input.roles,
  });

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let claims = initialClaims;
    const missingOrganizationContext = !claims.hasExplicitOrganization;
    const missingRoleClaim = claims.roleFromClaims === null;

    if (missingOrganizationContext || missingRoleClaim) {
      const fallback = await resolveFallbackContext(client, claims);
      if (fallback) {
        claims = applyFallbackContext(claims, fallback);
      }
    }

    if (!claims.roleFromClaims) {
      if (!claims.hasExplicitOrganization) {
        throw new SessionContextError(
          'FORBIDDEN',
          'ORGANIZATION_SETUP_REQUIRED',
        );
      }

      throw new SessionContextError(
        'FORBIDDEN',
        'No WorkOS role found in session claims. Configure role/roles in WorkOS for this user and organization.',
      );
    }

    const user = await upsertUser(client, claims);
    const organization = await upsertOrganization(client, claims);
    const membership = await upsertMembership(client, organization.id, user.id, claims);

    await client.query('COMMIT');

    return {
      actorUserId: user.external_id,
      actorEmail: user.email,
      orgId: organization.external_id,
      orgName: organization.name,
      role: membership.role,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof SessionContextError) {
      throw error;
    }

    throw new SessionContextError(
      'INTERNAL',
      error instanceof Error ? error.message : 'Unexpected session provisioning failure',
    );
  } finally {
    client.release();
  }
}
