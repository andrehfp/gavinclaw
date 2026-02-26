import { queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAuthenticatedContext, toApiErrorResponse } from '@/lib/server/authz';

export async function GET() {
  let context;

  try {
    context = await requireAuthenticatedContext();

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'context.read',
      resource: 'session',
      status: 'success',
      payload: {
        role: context.role,
      },
    });

    return Response.json({
      actorUserId: context.actorUserId,
      actorEmail: context.actorEmail,
      orgId: context.orgId,
      orgName: context.orgName,
      role: context.role,
      conversationCount: context.conversationCount,
    });
  } catch (error) {
    if (context) {
      try {
        queueMirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'context.read',
          resource: 'session',
          status: 'failed',
          payload: {
            reason: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch {
        // The primary request failure is returned below.
      }
    }

    return toApiErrorResponse(error);
  }
}
