import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let context;
  let conversationId: string | null = null;
  let messageId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId } = await params);

    let body: { messageId?: unknown } = {};
    try {
      body = (await request.json()) as { messageId?: unknown };
    } catch {
      body = {};
    }

    messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';
    if (!messageId) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'messageId is required');
    }

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'conversation.fork',
        resource: 'conversation',
        status: 'denied',
        payload: {
          ...(conversationId ? { conversationId } : {}),
          ...(messageId ? { messageId } : {}),
          reason: error instanceof Error ? error.message : 'Role not allowed',
          role: context.role,
        },
      });
      auditLogged = true;
      throw error;
    }

    const client = getServerConvexClient(context.accessToken);
    const conversation = await client.mutation(api.conversations.forkConversation, {
      sourceConversationId: conversationId as Id<'conversations'>,
      upToMessageId: messageId,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.fork',
      resource: 'conversation',
      status: 'success',
      payload: {
        sourceConversationId: conversationId,
        messageId,
        forkedConversationId: conversation.id,
      },
    });
    auditLogged = true;

    return Response.json({ conversation }, { status: 201 });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'conversation.fork',
          resource: 'conversation',
          status: 'failed',
          payload: {
            ...(conversationId ? { conversationId } : {}),
            ...(messageId ? { messageId } : {}),
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
