import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let context;
  let conversationId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId } = await params);

    let body: { projectId?: unknown } = {};
    try {
      body = (await request.json()) as { projectId?: unknown };
    } catch {
      body = {};
    }

    const rawProjectId = body.projectId;
    if (rawProjectId !== undefined && rawProjectId !== null && typeof rawProjectId !== 'string') {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'projectId must be a string or null');
    }

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'conversation.assign_project',
        resource: 'conversation',
        status: 'denied',
        payload: {
          ...(conversationId ? { conversationId } : {}),
          reason: error instanceof Error ? error.message : 'Role not allowed',
          role: context.role,
        },
      });
      auditLogged = true;
      throw error;
    }

    const client = getServerConvexClient(context.accessToken);
    const conversation = await client.mutation(api.conversations.assignConversationProject, {
      conversationId: conversationId as Id<'conversations'>,
      ...(typeof rawProjectId === 'string' ? { projectId: rawProjectId as Id<'projects'> } : {}),
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.assign_project',
      resource: 'conversation',
      status: 'success',
      payload: {
        conversationId,
        projectId: conversation.projectId,
      },
    });
    auditLogged = true;

    return Response.json({ conversation });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'conversation.assign_project',
          resource: 'conversation',
          status: 'failed',
          payload: {
            ...(conversationId ? { conversationId } : {}),
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
