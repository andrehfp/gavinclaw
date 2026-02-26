import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';
import { extractAttachmentsFromParts, normalizeMessageParts } from '@/lib/chat/message-parts';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    const { conversationId } = await params;

    const client = getServerConvexClient(context.accessToken);
    const messages = await client.query(api.messages.listMessages, {
      conversationId: conversationId as Id<'conversations'>,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'message.list',
      resource: 'message',
      status: 'success',
      payload: {
        conversationId,
        count: messages.length,
      },
    });
    auditLogged = true;

    return Response.json({ messages });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'message.list',
          resource: 'message',
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();

    const body = (await request.json()) as {
      messageId?: string;
      content?: string;
      parts?: unknown[];
      attachments?: unknown[];
    };
    const content = body.content?.trim();
    const parts = normalizeMessageParts(body.parts, content);
    if (parts.length === 0) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'content or parts is required');
    }

    const inferredAttachments = extractAttachmentsFromParts(parts);

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'message.create',
        resource: 'message',
        status: 'denied',
        payload: {
          reason: error instanceof Error ? error.message : 'Role not allowed',
          role: context.role,
        },
      });
      auditLogged = true;
      throw error;
    }

    const { conversationId } = await params;
    const client = getServerConvexClient(context.accessToken);
    const conversation = await client.query(api.conversations.getConversation, {
      conversationId: conversationId as Id<'conversations'>,
    });
    if (conversation.status !== 'open') {
      throw new ApiError(409, 'CONFLICT', 'Conversation is archived. Unarchive it to continue chatting.');
    }

    const message = await client.mutation(api.messages.createMessage, {
      conversationId: conversationId as Id<'conversations'>,
      messageId: body.messageId,
      role: 'user',
      content,
      parts,
      attachments: body.attachments ?? inferredAttachments,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'message.create',
      resource: 'message',
      status: 'success',
      payload: {
        conversationId,
        messageId: message.id,
        partCount: parts.length,
      },
    });
    auditLogged = true;

    return Response.json({ message }, { status: 201 });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'message.create',
          resource: 'message',
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
