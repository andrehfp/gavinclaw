import { WorkOS } from '@workos-inc/node';
import { normalizeRoleClaim } from '@/lib/rbac';
import type { AdminInvitation, AdminMember, AdminMembershipStatus, AdminRole } from '@/lib/server/admin/types';
import { ApiError } from '@/lib/server/authz';

type WorkOSError = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  error_description?: unknown;
  errors?: unknown;
};

type WorkOSUserProfile = {
  email: string | null;
  name: string | null;
};

type MembershipSummary = {
  id: string;
  userId: string;
  role: AdminRole;
  roleSlug: string;
  status: AdminMembershipStatus;
  createdAt: string;
  updatedAt: string;
};

let cachedWorkOSClient: WorkOS | null = null;

function getWorkOSClient(): WorkOS {
  if (cachedWorkOSClient) {
    return cachedWorkOSClient;
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, 'WORKOS_NOT_CONFIGURED', 'WORKOS_API_KEY is required for admin membership operations');
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  cachedWorkOSClient = new WorkOS({
    apiKey,
    ...(clientId ? { clientId } : {}),
  });

  return cachedWorkOSClient;
}

function normalizeAdminRole(raw: string | null | undefined): AdminRole {
  if (!raw) {
    throw new ApiError(500, 'WORKOS_ROLE_MISSING', 'WorkOS membership is missing a role slug');
  }

  const normalized = normalizeRoleClaim(raw);
  if (normalized !== 'admin' && normalized !== 'user') {
    throw new ApiError(500, 'WORKOS_ROLE_INVALID', `Unsupported WorkOS role slug: ${raw}`);
  }

  return normalized;
}

function asNonEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const unique = new Set<string>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    unique.add(normalized);
  }

  return [...unique];
}

function toAdminMembershipStatus(raw: string): AdminMembershipStatus {
  if (raw === 'active' || raw === 'pending' || raw === 'inactive') {
    return raw;
  }

  return 'inactive';
}

function toUserName(user: { firstName: string | null; lastName: string | null }): string | null {
  const fullName = [user.firstName, user.lastName].filter((part) => typeof part === 'string' && part.trim().length > 0).join(' ').trim();
  return fullName.length > 0 ? fullName : null;
}

function asWorkOSError(error: unknown): WorkOSError {
  if (typeof error !== 'object' || error === null) {
    return {};
  }

  return error as WorkOSError;
}

function isInvalidRoleSlugError(error: unknown): boolean {
  const typed = asWorkOSError(error);
  const status = typeof typed.status === 'number' ? typed.status : null;
  if (status !== 400 && status !== 422) {
    return false;
  }

  const code = typeof typed.code === 'string' ? typed.code.toLowerCase() : '';
  const message = typeof typed.message === 'string'
    ? typed.message.toLowerCase()
    : typeof typed.error_description === 'string'
      ? typed.error_description.toLowerCase()
      : '';

  if (code.includes('role')) {
    return true;
  }

  return message.includes('role') && message.includes('invalid');
}

function mapWorkOSError(error: unknown, fallbackCode: string, fallbackMessage: string): ApiError {
  const typed = asWorkOSError(error);
  const status = typeof typed.status === 'number' ? typed.status : null;
  const code = typeof typed.code === 'string' && typed.code.trim().length > 0 ? typed.code : fallbackCode;
  const explicitMessage = typeof typed.message === 'string' && typed.message.trim().length > 0
    ? typed.message
    : typeof typed.error_description === 'string' && typed.error_description.trim().length > 0
      ? typed.error_description
      : fallbackMessage;

  if (status === 400) return new ApiError(400, code, explicitMessage);
  if (status === 401) return new ApiError(401, code, explicitMessage);
  if (status === 403) return new ApiError(403, code, explicitMessage);
  if (status === 404) return new ApiError(404, code, explicitMessage);
  if (status === 409) return new ApiError(409, code, explicitMessage);
  if (status === 422) return new ApiError(422, code, explicitMessage);
  if (status === 429) return new ApiError(429, code, explicitMessage);

  return new ApiError(502, code, explicitMessage);
}

async function resolveUserProfiles(userIds: string[]): Promise<Map<string, WorkOSUserProfile>> {
  const workos = getWorkOSClient();
  const uniqueUserIds = [...new Set(userIds)];
  const entries: Array<[string, WorkOSUserProfile]> = await Promise.all(uniqueUserIds.map(async (userId) => {
    try {
      const user = await workos.userManagement.getUser(userId);
      return [
        userId,
        {
          email: user.email ?? null,
          name: toUserName(user),
        },
      ];
    } catch {
      return [
        userId,
        {
          email: null,
          name: null,
        },
      ];
    }
  }));

  return new Map<string, WorkOSUserProfile>(entries);
}

async function listMembershipSummaries(orgId: string): Promise<MembershipSummary[]> {
  const workos = getWorkOSClient();

  try {
    const page = await workos.userManagement.listOrganizationMemberships({
      organizationId: orgId,
      statuses: ['active', 'pending', 'inactive'],
      limit: 100,
    });

    const memberships = await page.autoPagination();

    return memberships.map((membership) => ({
      roleSlug: membership.role?.slug ?? membership.roles?.[0]?.slug ?? '',
      id: membership.id,
      userId: membership.userId,
      role: normalizeAdminRole(membership.role?.slug ?? membership.roles?.[0]?.slug),
      status: toAdminMembershipStatus(membership.status),
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
    }));
  } catch (error) {
    throw mapWorkOSError(error, 'WORKOS_MEMBERSHIPS_LIST_FAILED', 'Could not list organization memberships from WorkOS');
  }
}

export async function listOrganizationMembershipSummaries(orgId: string): Promise<MembershipSummary[]> {
  return listMembershipSummaries(orgId);
}

export async function listOrganizationMembers(orgId: string): Promise<AdminMember[]> {
  const memberships = await listMembershipSummaries(orgId);
  const profiles = await resolveUserProfiles(memberships.map((membership) => membership.userId));

  return memberships
    .map((membership) => {
      const user = profiles.get(membership.userId);
      return {
        membershipId: membership.id,
        userId: membership.userId,
        email: user?.email ?? null,
        name: user?.name ?? null,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      } satisfies AdminMember;
    })
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'admin' ? -1 : 1;
      }
      if (left.status !== right.status) {
        return left.status === 'active' ? -1 : 1;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
}

function resolveFallbackRoleSlugCandidates(role: AdminRole): string[] {
  const adminOverride = asNonEmptyString(process.env.WORKOS_ADMIN_ROLE_SLUG);
  const userOverride = asNonEmptyString(process.env.WORKOS_USER_ROLE_SLUG);

  if (role === 'admin') {
    return uniqueStrings([adminOverride, 'admin', 'owner']);
  }

  return uniqueStrings([userOverride, 'user', 'member']);
}

async function resolveRoleSlugCandidates(input: { orgId: string; role: AdminRole }): Promise<string[]> {
  const roleSlugFromOrg = new Set<string>();
  try {
    const memberships = await listMembershipSummaries(input.orgId);
    for (const membership of memberships) {
      if (membership.role === input.role && membership.roleSlug.trim().length > 0) {
        roleSlugFromOrg.add(membership.roleSlug.trim());
      }
    }
  } catch {
    // If org membership introspection fails, we still fall back to known slug aliases.
  }

  return uniqueStrings([...roleSlugFromOrg, ...resolveFallbackRoleSlugCandidates(input.role)]);
}

function requireRoleSlugCandidates(orgId: string, role: AdminRole, candidates: string[]): string[] {
  if (candidates.length > 0) {
    return candidates;
  }

  throw new ApiError(
    500,
    'WORKOS_ROLE_CANDIDATES_EMPTY',
    `No WorkOS role slug candidates resolved for role ${role} in organization ${orgId}`,
  );
}

export async function listOrganizationInvitations(orgId: string): Promise<AdminInvitation[]> {
  const workos = getWorkOSClient();

  try {
    const page = await workos.userManagement.listInvitations({
      organizationId: orgId,
      limit: 100,
    });
    const invitations = await page.autoPagination();

    return invitations
      .filter((invitation) => invitation.state === 'pending')
      .map((invitation) => ({
        invitationId: invitation.id,
        email: invitation.email,
        role: null,
        state: invitation.state,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        acceptInvitationUrl: invitation.acceptInvitationUrl,
      }));
  } catch (error) {
    throw mapWorkOSError(error, 'WORKOS_INVITATIONS_LIST_FAILED', 'Could not list organization invitations from WorkOS');
  }
}

export async function inviteOrganizationMember(input: {
  orgId: string;
  email: string;
  role: AdminRole;
  inviterUserId: string;
}): Promise<AdminInvitation> {
  const workos = getWorkOSClient();
  const roleSlugCandidates = requireRoleSlugCandidates(
    input.orgId,
    input.role,
    await resolveRoleSlugCandidates({ orgId: input.orgId, role: input.role }),
  );
  let lastRoleError: unknown = null;

  for (const roleSlug of roleSlugCandidates) {
    try {
      const invitation = await workos.userManagement.sendInvitation({
        email: input.email,
        organizationId: input.orgId,
        inviterUserId: input.inviterUserId,
        roleSlug,
        expiresInDays: 7,
      });

      return {
        invitationId: invitation.id,
        email: invitation.email,
        role: input.role,
        state: invitation.state,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        acceptInvitationUrl: invitation.acceptInvitationUrl,
      };
    } catch (error) {
      if (isInvalidRoleSlugError(error)) {
        lastRoleError = error;
        continue;
      }

      throw mapWorkOSError(error, 'WORKOS_INVITATION_SEND_FAILED', 'Could not send organization invitation');
    }
  }

  if (lastRoleError) {
    throw mapWorkOSError(
      lastRoleError,
      'WORKOS_INVITATION_SEND_FAILED',
      `Could not send organization invitation: no valid WorkOS role slug found for ${input.role}`,
    );
  }

  throw new ApiError(500, 'WORKOS_INVITATION_SEND_FAILED', 'Could not send organization invitation');
}

export async function updateOrganizationMembershipRole(input: {
  orgId: string;
  membershipId: string;
  role: AdminRole;
}): Promise<AdminMember> {
  const workos = getWorkOSClient();

  try {
    const existing = await workos.userManagement.getOrganizationMembership(input.membershipId);
    if (existing.organizationId !== input.orgId) {
      throw new ApiError(404, 'NOT_FOUND', 'Membership not found in this organization');
    }
    const roleSlugCandidates = requireRoleSlugCandidates(
      input.orgId,
      input.role,
      await resolveRoleSlugCandidates({ orgId: input.orgId, role: input.role }),
    );
    let lastRoleError: unknown = null;
    let updated: Awaited<ReturnType<typeof workos.userManagement.updateOrganizationMembership>> | null = null;
    for (const roleSlug of roleSlugCandidates) {
      try {
        updated = await workos.userManagement.updateOrganizationMembership(input.membershipId, {
          roleSlug,
        });
        break;
      } catch (error) {
        if (isInvalidRoleSlugError(error)) {
          lastRoleError = error;
          continue;
        }
        throw error;
      }
    }
    if (!updated) {
      if (lastRoleError) {
        throw mapWorkOSError(
          lastRoleError,
          'WORKOS_MEMBERSHIP_UPDATE_FAILED',
          `Could not update organization membership role: no valid WorkOS role slug found for ${input.role}`,
        );
      }
      throw new ApiError(500, 'WORKOS_MEMBERSHIP_UPDATE_FAILED', 'Could not update organization membership role');
    }

    const user = await workos.userManagement.getUser(updated.userId);

    return {
      membershipId: updated.id,
      userId: updated.userId,
      email: user.email ?? null,
      name: toUserName(user),
      role: normalizeAdminRole(updated.role?.slug ?? updated.roles?.[0]?.slug),
      status: toAdminMembershipStatus(updated.status),
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw mapWorkOSError(error, 'WORKOS_MEMBERSHIP_UPDATE_FAILED', 'Could not update organization membership role');
  }
}

export async function deleteOrganizationMembership(input: {
  orgId: string;
  membershipId: string;
}): Promise<void> {
  const workos = getWorkOSClient();

  try {
    const existing = await workos.userManagement.getOrganizationMembership(input.membershipId);
    if (existing.organizationId !== input.orgId) {
      throw new ApiError(404, 'NOT_FOUND', 'Membership not found in this organization');
    }

    await workos.userManagement.deleteOrganizationMembership(input.membershipId);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    throw mapWorkOSError(error, 'WORKOS_MEMBERSHIP_DELETE_FAILED', 'Could not delete organization membership');
  }
}
