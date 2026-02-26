import { WorkOS } from '@workos-inc/node';
import { normalizeRoleClaim, type Role } from '@/lib/rbac';

type WorkOSError = {
  status?: unknown;
  code?: unknown;
  message?: unknown;
  error_description?: unknown;
};

type ResolvedOrganizationContext = {
  orgId: string;
  orgName: string;
  role: Role;
  roleSlug: string;
};

export class WorkOSProvisioningError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let cachedWorkOSClient: WorkOS | null = null;

function getWorkOSClient(): WorkOS {
  if (cachedWorkOSClient) {
    return cachedWorkOSClient;
  }

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new WorkOSProvisioningError(
      500,
      'WORKOS_NOT_CONFIGURED',
      'WORKOS_API_KEY is required for organization provisioning',
    );
  }

  const clientId = process.env.WORKOS_CLIENT_ID;
  cachedWorkOSClient = new WorkOS({
    apiKey,
    ...(clientId ? { clientId } : {}),
  });

  return cachedWorkOSClient;
}

function asWorkOSError(error: unknown): WorkOSError {
  if (typeof error !== 'object' || error === null) {
    return {};
  }

  return error as WorkOSError;
}

function mapWorkOSError(error: unknown, fallbackCode: string, fallbackMessage: string): WorkOSProvisioningError {
  const typed = asWorkOSError(error);
  const status = typeof typed.status === 'number' ? typed.status : null;
  const code = typeof typed.code === 'string' && typed.code.trim().length > 0 ? typed.code : fallbackCode;
  const message = typeof typed.message === 'string' && typed.message.trim().length > 0
    ? typed.message
    : typeof typed.error_description === 'string' && typed.error_description.trim().length > 0
      ? typed.error_description
      : fallbackMessage;

  if (status === 400) return new WorkOSProvisioningError(400, code, message);
  if (status === 401) return new WorkOSProvisioningError(401, code, message);
  if (status === 403) return new WorkOSProvisioningError(403, code, message);
  if (status === 404) return new WorkOSProvisioningError(404, code, message);
  if (status === 409) return new WorkOSProvisioningError(409, code, message);
  if (status === 422) return new WorkOSProvisioningError(422, code, message);
  if (status === 429) return new WorkOSProvisioningError(429, code, message);

  return new WorkOSProvisioningError(502, code, message);
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

function asNonEmptyString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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

function resolveAdminRoleSlugCandidates(): string[] {
  return uniqueStrings([asNonEmptyString(process.env.WORKOS_ADMIN_ROLE_SLUG), 'admin', 'owner']);
}

function normalizeRole(raw: string | null | undefined): Role | null {
  if (!raw) {
    return null;
  }

  const role = normalizeRoleClaim(raw);
  if (role !== 'admin' && role !== 'user') {
    return null;
  }

  return role;
}

export async function resolveActiveOrganizationContextForUser(userId: string): Promise<ResolvedOrganizationContext | null> {
  const workos = getWorkOSClient();

  try {
    const page = await workos.userManagement.listOrganizationMemberships({
      userId,
      statuses: ['active'],
      limit: 100,
    });
    const memberships = await page.autoPagination();

    const candidates = memberships
      .map((membership) => {
        const roleSlug = membership.role?.slug ?? membership.roles?.[0]?.slug ?? null;
        const role = normalizeRole(roleSlug);
        if (!role || !roleSlug) {
          return null;
        }

        return {
          orgId: membership.organizationId,
          orgName: membership.organizationName,
          role,
          roleSlug,
          updatedAt: membership.updatedAt,
        };
      })
      .filter((value): value is {
        orgId: string;
        orgName: string;
        role: Role;
        roleSlug: string;
        updatedAt: string;
      } => value !== null)
      .sort((left, right) => {
        if (left.role !== right.role) {
          return left.role === 'admin' ? -1 : 1;
        }

        return right.updatedAt.localeCompare(left.updatedAt);
      });

    const selected = candidates[0];
    if (!selected) {
      return null;
    }

    return {
      orgId: selected.orgId,
      orgName: selected.orgName,
      role: selected.role,
      roleSlug: selected.roleSlug,
    };
  } catch (error) {
    throw mapWorkOSError(
      error,
      'WORKOS_MEMBERSHIPS_LIST_FAILED',
      'Could not resolve active organization memberships from WorkOS',
    );
  }
}

export async function provisionOrganizationForUser(input: {
  userId: string;
  organizationName: string;
}): Promise<ResolvedOrganizationContext> {
  const workos = getWorkOSClient();
  const roleSlugCandidates = resolveAdminRoleSlugCandidates();
  if (roleSlugCandidates.length === 0) {
    throw new WorkOSProvisioningError(
      500,
      'WORKOS_ROLE_CANDIDATES_EMPTY',
      'No admin role slugs were configured for organization provisioning',
    );
  }

  let organizationId: string | null = null;

  try {
    const organization = await workos.organizations.createOrganization({
      name: input.organizationName,
    });
    organizationId = organization.id;

    let lastRoleError: unknown = null;
    for (const roleSlug of roleSlugCandidates) {
      try {
        const membership = await workos.userManagement.createOrganizationMembership({
          organizationId: organization.id,
          userId: input.userId,
          roleSlug,
        });

        const effectiveRoleSlug = membership.role?.slug ?? membership.roles?.[0]?.slug ?? roleSlug;
        const normalizedRole = normalizeRole(effectiveRoleSlug);
        if (normalizedRole !== 'admin') {
          throw new WorkOSProvisioningError(
            500,
            'WORKOS_ROLE_INVALID',
            `Expected admin role for organization owner, got ${effectiveRoleSlug}`,
          );
        }

        return {
          orgId: organization.id,
          orgName: organization.name,
          role: normalizedRole,
          roleSlug: effectiveRoleSlug,
        };
      } catch (error) {
        if (isInvalidRoleSlugError(error)) {
          lastRoleError = error;
          continue;
        }

        throw mapWorkOSError(
          error,
          'WORKOS_MEMBERSHIP_CREATE_FAILED',
          'Could not create organization membership for onboarding user',
        );
      }
    }

    if (lastRoleError) {
      throw mapWorkOSError(
        lastRoleError,
        'WORKOS_MEMBERSHIP_CREATE_FAILED',
        'Could not create organization membership with a valid admin role slug',
      );
    }

    throw new WorkOSProvisioningError(
      500,
      'WORKOS_MEMBERSHIP_CREATE_FAILED',
      'Could not create organization membership for onboarding user',
    );
  } catch (error) {
    if (organizationId) {
      try {
        await workos.organizations.deleteOrganization(organizationId);
      } catch {
        // Best effort rollback. The organization can be cleaned up manually if needed.
      }
    }

    if (error instanceof WorkOSProvisioningError) {
      throw error;
    }

    throw mapWorkOSError(error, 'WORKOS_ORG_CREATE_FAILED', 'Could not create organization in WorkOS');
  }
}
