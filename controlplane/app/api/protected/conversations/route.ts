import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

const DEFAULT_CONVERSATION_TITLE = 'New Chat';

export async function GET(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    const client = getServerConvexClient(context.accessToken);
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');
    const parsedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const status = statusParam === 'open' || statusParam === 'closed' ? statusParam : undefined;

    const conversations = await client.query(api.conversations.listConversations, {
      ...(limit !== undefined ? { limit } : {}),
      ...(status ? { status } : {}),
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.list',
      resource: 'conversation',
      status: 'success',
      payload: {
        count: conversations.length,
      },
    });
    auditLogged = true;

    return Response.json({
      conversations,
    });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'conversation.list',
          resource: 'conversation',
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

export async function POST(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();

    let body: { title?: unknown; projectId?: unknown } = {};
    try {
      body = (await request.json()) as { title?: unknown; projectId?: unknown };
    } catch {
      body = {};
    }

    const requestedTitle = typeof body.title === 'string' ? body.title.trim() : '';
    const title = requestedTitle || DEFAULT_CONVERSATION_TITLE;
    const projectId = body.projectId;
    if (projectId !== undefined && projectId !== null && typeof projectId !== 'string') {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'projectId must be a string when provided');
    }

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'conversation.create',
        resource: 'conversation',
        status: 'denied',
        payload: {
          reason: error instanceof Error ? error.message : 'Role not allowed',
          role: context.role,
        },
      });
      auditLogged = true;
      throw error;
    }

    const client = getServerConvexClient(context.accessToken);
    const conversation = await client.mutation(api.conversations.createConversation, {
      title,
      ...(typeof projectId === 'string' ? { projectId: projectId as Id<'projects'> } : {}),
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'conversation.create',
      resource: 'conversation',
      status: 'success',
      payload: {
        conversationId: conversation.id,
        projectId: conversation.projectId,
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
          action: 'conversation.create',
          resource: 'conversation',
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
