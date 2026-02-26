import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import type { AdminRole } from '@/lib/server/admin/types';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { requireAdminContext } from '@/lib/server/admin/context';
import { inviteOrganizationMember } from '@/lib/server/workos/admin';

function parseRole(value: unknown): AdminRole {
  if (value === 'admin' || value === 'user') {
    return value;
  }

  throw new ApiError(400, 'INVALID_ARGUMENT', 'role must be either admin or user');
}

function parseEmail(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'email is required');
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'email must be valid');
  }

  return normalized;
}

export async function POST(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();

    let body: { email?: unknown; role?: unknown } = {};
    try {
      body = (await request.json()) as { email?: unknown; role?: unknown };
    } catch {
      body = {};
    }

    const email = parseEmail(body.email);
    const role = parseRole(body.role);

    const invitation = await inviteOrganizationMember({
      orgId: context.orgId,
      email,
      role,
      inviterUserId: context.actorUserId,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.member.invite',
      resource: 'organization_membership',
      status: 'success',
      payload: {
        email,
        role,
        invitationId: invitation.invitationId,
      },
    });
    auditLogged = true;

    return Response.json({ invitation }, { status: 201 });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.member.invite',
          resource: 'organization_membership',
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'failed',
          payload: {
            reason: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch {
        // Primary failure is returned below.
      }
    }

    return toApiErrorResponse(error);
  }
}
