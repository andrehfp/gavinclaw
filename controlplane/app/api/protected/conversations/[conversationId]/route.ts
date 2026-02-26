import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

type ConversationRouteParams = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(
  _request: Request,
  { params }: ConversationRouteParams,
) {
  let context;
  let conversationId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId } = await params);

    const client = getServerConvexClient(context.accessToken);
    const conversation = await client.query(api.conversations.getConversation, {
      conversationId: conversationId as Id<'conversations'>,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.read',
      resource: 'conversation',
      status: 'success',
      payload: {
        conversationId,
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
          action: 'conversation.read',
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

export async function PATCH(
  request: Request,
  { params }: ConversationRouteParams,
) {
  let context;
  let conversationId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId } = await params);

    let body: { title?: unknown } = {};
    try {
      body = (await request.json()) as { title?: unknown };
    } catch {
      body = {};
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'title is required');
    }

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'conversation.rename',
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
    const conversation = await client.mutation(api.conversations.renameConversation, {
      conversationId: conversationId as Id<'conversations'>,
      title,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.rename',
      resource: 'conversation',
      status: 'success',
      payload: {
        conversationId,
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
          action: 'conversation.rename',
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

export async function DELETE(
  _request: Request,
  { params }: ConversationRouteParams,
) {
  let context;
  let conversationId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId } = await params);

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'conversation.delete',
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
    const conversation = await client.mutation(api.conversations.deleteConversation, {
      conversationId: conversationId as Id<'conversations'>,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.delete',
      resource: 'conversation',
      status: 'success',
      payload: {
        conversationId,
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
          action: 'conversation.delete',
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
