import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { assertNotRemovingLastActiveAdmin } from '@/lib/server/admin/members';
import type { AdminRole } from '@/lib/server/admin/types';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { requireAdminContext } from '@/lib/server/admin/context';
import {
  deleteOrganizationMembership,
  listOrganizationMembershipSummaries,
  updateOrganizationMembershipRole,
} from '@/lib/server/workos/admin';

function parseRole(value: unknown): AdminRole {
  if (value === 'admin' || value === 'user') {
    return value;
  }

  throw new ApiError(400, 'INVALID_ARGUMENT', 'role must be either admin or user');
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  let context;
  let membershipId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    ({ membershipId } = await params);

    let body: { role?: unknown } = {};
    try {
      body = (await request.json()) as { role?: unknown };
    } catch {
      body = {};
    }

    const role = parseRole(body.role);
    const memberships = await listOrganizationMembershipSummaries(context.orgId);

    assertNotRemovingLastActiveAdmin({
      memberships,
      targetMembershipId: membershipId,
      nextRole: role,
    });

    const member = await updateOrganizationMembershipRole({
      orgId: context.orgId,
      membershipId,
      role,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.member.role.update',
      resource: 'organization_membership',
      status: 'success',
      payload: {
        membershipId,
        role,
      },
    });
    auditLogged = true;

    return Response.json({ member });
  } catch (error) {
    if (error instanceof Error && error.message.includes('At least one active admin')) {
      return toApiErrorResponse(new ApiError(409, 'LAST_ADMIN_REQUIRED', error.message));
    }

    if (context && membershipId && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.member.role.update',
          resource: 'organization_membership',
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'failed',
          payload: {
            membershipId,
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  let context;
  let membershipId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    ({ membershipId } = await params);

    const memberships = await listOrganizationMembershipSummaries(context.orgId);
    assertNotRemovingLastActiveAdmin({
      memberships,
      targetMembershipId: membershipId,
    });

    await deleteOrganizationMembership({
      orgId: context.orgId,
      membershipId,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.member.delete',
      resource: 'organization_membership',
      status: 'success',
      payload: {
        membershipId,
      },
    });
    auditLogged = true;

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('At least one active admin')) {
      return toApiErrorResponse(new ApiError(409, 'LAST_ADMIN_REQUIRED', error.message));
    }

    if (context && membershipId && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.member.delete',
          resource: 'organization_membership',
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'failed',
          payload: {
            membershipId,
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
