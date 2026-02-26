import { ConvexError } from 'convex/values';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';

export const ROLES = ['admin', 'user'] as const;
export type Role = (typeof ROLES)[number];

const WRITE_ROLES: readonly Role[] = ['admin', 'user'];

type IdentityClaims = {
  subject: string;
  email?: string;
  name?: string;
  org_id?: string;
  organization_id?: string;
  organizationId?: string;
  org_name?: string;
  organization_name?: string;
  role?: string;
  roles?: string[];
};

type MembershipDoc = Doc<'memberships'>;
type SessionMembership = Omit<MembershipDoc, 'role'> & { role: Role };

type SessionContext = {
  user: Doc<'users'>;
  organization: Doc<'organizations'>;
  membership: SessionMembership;
};

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

function normalizeRoleClaim(value: string): Role | null {
  const normalized = value.trim().toLowerCase();
  if (isRole(normalized)) {
    return normalized;
  }
  if (normalized === 'owner') return 'admin';
  if (normalized === 'analyst' || normalized === 'viewer' || normalized === 'member') return 'user';
  return null;
}

function roleFromClaims(identity: IdentityClaims): Role | null {
  const role = identity.role;
  if (role) {
    const normalizedRole = normalizeRoleClaim(role);
    if (normalizedRole) {
      return normalizedRole;
    }
  }

  if (identity.roles) {
    for (const claimRole of identity.roles) {
      const normalizedRole = normalizeRoleClaim(claimRole);
      if (normalizedRole) {
        return normalizedRole;
      }
    }
  }

  return null;
}

function ensureIdentity(identity: IdentityClaims | null): IdentityClaims {
  if (!identity) {
    throw new ConvexError({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
  }

  return identity;
}

function pickExternalOrganizationId(identity: IdentityClaims): string {
  return identity.org_id ?? identity.organization_id ?? identity.organizationId ?? `personal_${identity.subject}`;
}

function pickOrganizationName(identity: IdentityClaims): string {
  return identity.org_name ?? identity.organization_name ?? `Workspace ${identity.subject.slice(0, 8)}`;
}

async function upsertUser(ctx: MutationCtx, identity: IdentityClaims): Promise<Doc<'users'>> {
  const existing = await ctx.db
    .query('users')
    .withIndex('by_external_id', (q) => q.eq('externalId', identity.subject))
    .unique();

  if (existing) {
    const patch: Partial<Doc<'users'>> = {};
    if (identity.email && existing.email !== identity.email) {
      patch.email = identity.email;
    }
    if (identity.name && existing.name !== identity.name) {
      patch.name = identity.name;
    }

    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(existing._id, patch);
      return { ...existing, ...patch };
    }

    return existing;
  }

  const userId = await ctx.db.insert('users', {
    externalId: identity.subject,
    email: identity.email,
    name: identity.name,
  });

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new ConvexError({ code: 'USER_CREATE_FAILED', message: 'Could not create user' });
  }

  return user;
}

async function upsertOrganization(ctx: MutationCtx, identity: IdentityClaims): Promise<Doc<'organizations'>> {
  const externalId = pickExternalOrganizationId(identity);
  const existing = await ctx.db
    .query('organizations')
    .withIndex('by_external_id', (q) => q.eq('externalId', externalId))
    .unique();

  if (existing) {
    return existing;
  }

  const isPersonal = externalId.startsWith('personal_');
  const organizationId = await ctx.db.insert('organizations', {
    externalId,
    name: isPersonal ? `Personal workspace (${identity.subject.slice(0, 8)})` : pickOrganizationName(identity),
    isPersonal,
  });

  const organization = await ctx.db.get(organizationId);
  if (!organization) {
    throw new ConvexError({ code: 'ORG_CREATE_FAILED', message: 'Could not create organization' });
  }

  return organization;
}

async function upsertMembership(
  ctx: MutationCtx,
  organizationId: Id<'organizations'>,
  userId: Id<'users'>,
  identity: IdentityClaims,
): Promise<SessionMembership> {
  const existing = await ctx.db
    .query('memberships')
    .withIndex('by_org_user', (q) => q.eq('orgId', organizationId).eq('userId', userId))
    .unique();

  const claimRole = roleFromClaims(identity);
  if (!claimRole) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: 'No WorkOS role found in session claims. Configure role/roles in WorkOS for this user and organization.',
    });
  }

  if (existing) {
    if (
      existing.role !== claimRole
      || existing.source !== 'workos'
      || existing.externalRole !== claimRole
      || existing.status !== 'active'
    ) {
      await ctx.db.patch(existing._id, {
        role: claimRole,
        source: 'workos',
        externalRole: claimRole,
        status: 'active',
      });
      return {
        ...existing,
        role: claimRole,
        source: 'workos',
        externalRole: claimRole,
        status: 'active',
      };
    }

    return normalizeMembershipRole(existing);
  }
  const membershipId = await ctx.db.insert('memberships', {
    orgId: organizationId,
    userId,
    role: claimRole,
    status: 'active',
    source: 'workos',
    externalRole: claimRole,
  });

  const membership = await ctx.db.get(membershipId);
  if (!membership) {
    throw new ConvexError({ code: 'MEMBERSHIP_CREATE_FAILED', message: 'Could not create membership' });
  }

  return normalizeMembershipRole(membership);
}

function normalizeMembershipRole(membership: MembershipDoc): SessionMembership {
  const normalizedRole = normalizeRoleClaim(String(membership.role));
  if (!normalizedRole) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: `Role ${membership.role} is not allowed to perform this action.`,
    });
  }

  if (normalizedRole !== membership.role) {
    return {
      ...membership,
      role: normalizedRole,
    };
  }

  return membership as SessionMembership;
}

export async function ensureSessionContext(ctx: MutationCtx): Promise<SessionContext> {
  const identity = ensureIdentity((await ctx.auth.getUserIdentity()) as IdentityClaims | null);

  const user = await upsertUser(ctx, identity);
  const organization = await upsertOrganization(ctx, identity);
  const membership = await upsertMembership(ctx, organization._id, user._id, identity);

  return { user, organization, membership };
}

export async function resolveExistingSessionContext(ctx: QueryCtx | MutationCtx): Promise<SessionContext> {
  const identity = ensureIdentity((await ctx.auth.getUserIdentity()) as IdentityClaims | null);

  const user = await ctx.db
    .query('users')
    .withIndex('by_external_id', (q) => q.eq('externalId', identity.subject))
    .unique();
  if (!user) {
    throw new ConvexError({
      code: 'USER_NOT_PROVISIONED',
      message: 'User is not provisioned. Call ensureSessionContext first.',
    });
  }

  const externalOrgId = pickExternalOrganizationId(identity);
  const organization = await ctx.db
    .query('organizations')
    .withIndex('by_external_id', (q) => q.eq('externalId', externalOrgId))
    .unique();
  if (!organization) {
    throw new ConvexError({
      code: 'ORG_NOT_PROVISIONED',
      message: 'Organization is not provisioned. Call ensureSessionContext first.',
    });
  }

  const membership = await ctx.db
    .query('memberships')
    .withIndex('by_org_user', (q) => q.eq('orgId', organization._id).eq('userId', user._id))
    .unique();
  if (!membership || membership.status !== 'active') {
    throw new ConvexError({
      code: 'MEMBERSHIP_NOT_ACTIVE',
      message: 'No active membership for this organization.',
    });
  }

  return { user, organization, membership: normalizeMembershipRole(membership) };
}

export function assertRole(role: string, allowedRoles: readonly Role[]): void {
  const normalizedRole = normalizeRoleClaim(String(role));
  if (!normalizedRole || !allowedRoles.includes(normalizedRole)) {
    throw new ConvexError({
      code: 'FORBIDDEN',
      message: `Role ${role} is not allowed to perform this action.`,
    });
  }
}

export function canWrite(role: string): boolean {
  const normalizedRole = normalizeRoleClaim(String(role));
  return normalizedRole !== null && WRITE_ROLES.includes(normalizedRole);
}

export function toPublicSessionContext(context: SessionContext) {
  return {
    orgId: context.organization.externalId,
    orgName: context.organization.name,
    role: context.membership.role,
    actorUserId: context.user.externalId,
    actorEmail: context.user.email ?? null,
    conversationCount: 0,
  };
}
