import { withAuth } from '@workos-inc/authkit-nextjs';
import { api } from '@/convex/_generated/api';
import { hasRole, type Role } from '@/lib/rbac';
import { ensurePostgresSessionContext, SessionContextError } from '@/lib/server/domain/session';
import { getServerConvexClient } from '@/lib/server/convex-client';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type ProtectedContext = {
  accessToken: string;
  actorUserId: string;
  actorEmail: string | null;
  orgId: string;
  orgName: string;
  role: Role;
  conversationCount: number;
};

export async function requireAuthenticatedContext(options?: { includeConversationCount?: boolean }): Promise<ProtectedContext> {
  const session = await withAuth();
  if (!session.user || !session.accessToken) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  let postgresContext;
  try {
    postgresContext = await ensurePostgresSessionContext({
      accessToken: session.accessToken,
      user: session.user,
      organizationId: 'organizationId' in session ? session.organizationId : undefined,
      role: 'role' in session ? session.role : undefined,
      roles: 'roles' in session && Array.isArray(session.roles) ? session.roles : undefined,
    });
  } catch (error) {
    if (error instanceof SessionContextError && error.code === 'UNAUTHENTICATED') {
      throw new ApiError(401, 'UNAUTHENTICATED', error.message);
    }
    if (error instanceof SessionContextError && error.code === 'FORBIDDEN') {
      if (error.message === 'ORGANIZATION_SETUP_REQUIRED') {
        throw new ApiError(
          403,
          'ORGANIZATION_SETUP_REQUIRED',
          'Organization setup is required before accessing the workspace',
        );
      }
      throw new ApiError(403, 'FORBIDDEN', error.message);
    }

    throw new ApiError(500, 'SESSION_PROVISIONING_FAILED', 'Could not resolve authenticated session context');
  }

  let conversationCount = 0;
  if (options?.includeConversationCount) {
    try {
      const client = getServerConvexClient(session.accessToken);
      const convexContext = await client.mutation(api.auth.ensureSession, {});
      conversationCount = convexContext.conversationCount;
    } catch {
      // Convex is a realtime projection. Auth/RBAC authority is Postgres.
    }
  }

  return {
    accessToken: session.accessToken,
    actorUserId: postgresContext.actorUserId,
    actorEmail: postgresContext.actorEmail,
    orgId: postgresContext.orgId,
    orgName: postgresContext.orgName,
    role: postgresContext.role,
    conversationCount,
  };
}

export function requireRole(context: ProtectedContext, allowedRoles: readonly Role[]): void {
  if (!hasRole(context.role, allowedRoles)) {
    throw new ApiError(403, 'FORBIDDEN', `Role ${context.role} is not allowed to access this resource`);
  }
}

export function toApiErrorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : 'Unexpected server error';
  return Response.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message,
      },
    },
    { status: 500 },
  );
}
