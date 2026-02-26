import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { requireAdminContext } from '@/lib/server/admin/context';
import { listOrganizationInvitations, listOrganizationMembers } from '@/lib/server/workos/admin';

export async function GET() {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    const [members, invitations] = await Promise.all([
      listOrganizationMembers(context.orgId),
      listOrganizationInvitations(context.orgId),
    ]);

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.members.list',
      resource: 'organization_membership',
      status: 'success',
      payload: {
        membersCount: members.length,
        invitationsCount: invitations.length,
      },
    });
    auditLogged = true;

    return Response.json({ members, invitations });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.members.list',
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
