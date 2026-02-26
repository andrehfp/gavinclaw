import { withAuth } from '@workos-inc/authkit-nextjs';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { deriveIdentityClaims, ensurePostgresSessionContext } from '@/lib/server/domain/session';
import {
  provisionOrganizationForUser,
  resolveActiveOrganizationContextForUser,
  WorkOSProvisioningError,
} from '@/lib/server/workos/provisioning';

type OrganizationContextResponse = {
  orgId: string;
  orgName: string;
  role: 'admin' | 'user';
};

function parseOrganizationName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'organizationName is required');
  }

  const normalized = value.trim();
  if (normalized.length < 2) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'organizationName must have at least 2 characters');
  }
  if (normalized.length > 80) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'organizationName must have at most 80 characters');
  }

  return normalized;
}

function suggestOrganizationName(input: { name: string | null; email: string | null }): string {
  if (input.name) {
    const first = input.name.trim().split(/\s+/)[0];
    if (first) {
      return `${first} Company`;
    }
  }

  if (input.email) {
    const localPart = input.email.split('@')[0]?.trim();
    if (localPart) {
      const normalized = localPart.replace(/[._-]+/g, ' ').trim();
      if (normalized) {
        const label = normalized.charAt(0).toUpperCase() + normalized.slice(1);
        return `${label} Company`;
      }
    }
  }

  return 'My Organization';
}

async function getSessionClaims() {
  const session = await withAuth();
  if (!session.user || !session.accessToken) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  const hints = {
    organizationId: 'organizationId' in session ? session.organizationId : undefined,
    role: 'role' in session ? session.role : undefined,
    roles: 'roles' in session && Array.isArray(session.roles) ? session.roles : undefined,
  };

  const claims = deriveIdentityClaims(session.accessToken, session.user as unknown as Record<string, unknown>, hints);
  return {
    accessToken: session.accessToken,
    user: session.user,
    claims,
  };
}

async function resolveCurrentOrganizationContext(): Promise<{
  claims: Awaited<ReturnType<typeof getSessionClaims>>['claims'];
  context: OrganizationContextResponse | null;
}> {
  const { claims } = await getSessionClaims();

  if (claims.hasExplicitOrganization && claims.roleFromClaims) {
    return {
      claims,
      context: {
        orgId: claims.orgId,
        orgName: claims.orgName,
        role: claims.roleFromClaims,
      },
    };
  }

  try {
    const fallback = await resolveActiveOrganizationContextForUser(claims.subject);
    if (!fallback) {
      return { claims, context: null };
    }

    return {
      claims,
      context: {
        orgId: fallback.orgId,
        orgName: fallback.orgName,
        role: fallback.role,
      },
    };
  } catch (error) {
    if (error instanceof WorkOSProvisioningError) {
      throw new ApiError(error.status, error.code, error.message);
    }

    throw error;
  }
}

export async function GET() {
  try {
    const { claims, context } = await resolveCurrentOrganizationContext();

    return Response.json({
      requiresOrganizationSetup: context === null,
      context,
      suggestedOrganizationName: suggestOrganizationName({
        name: claims.name,
        email: claims.email,
      }),
    });
  } catch (error) {
    return toApiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { accessToken, user, claims } = await getSessionClaims();

    let body: { organizationName?: unknown } = {};
    try {
      body = (await request.json()) as { organizationName?: unknown };
    } catch {
      body = {};
    }
    const organizationName = parseOrganizationName(body.organizationName);

    if (claims.hasExplicitOrganization && claims.roleFromClaims) {
      return Response.json({
        created: false,
        context: {
          orgId: claims.orgId,
          orgName: claims.orgName,
          role: claims.roleFromClaims,
        },
      });
    }

    const existing = await resolveActiveOrganizationContextForUser(claims.subject);
    if (existing) {
      return Response.json({
        created: false,
        context: {
          orgId: existing.orgId,
          orgName: existing.orgName,
          role: existing.role,
        },
      });
    }

    let provisioned;
    try {
      provisioned = await provisionOrganizationForUser({
        userId: claims.subject,
        organizationName,
      });
    } catch (error) {
      if (error instanceof WorkOSProvisioningError) {
        throw new ApiError(error.status, error.code, error.message);
      }

      throw error;
    }

    const context = await ensurePostgresSessionContext({
      accessToken,
      user,
      organizationId: provisioned.orgId,
      role: provisioned.role,
      roles: [provisioned.role],
    });

    return Response.json(
      {
        created: true,
        context: {
          orgId: context.orgId,
          orgName: context.orgName,
          role: context.role,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return toApiErrorResponse(error);
  }
}
