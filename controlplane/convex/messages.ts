import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

type UnknownRecord = Record<string, unknown>;

function textPart(text: string): UnknownRecord {
  return {
    type: 'text',
    text,
  };
}

function textFromParts(parts: unknown[]): string {
  return parts
    .map((part) => {
      if (!part || typeof part !== 'object') {
        return '';
      }
      const typedPart = part as UnknownRecord;
      if (typedPart.type === 'text' && typeof typedPart.text === 'string') {
        return typedPart.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeParts(parts: unknown[] | undefined, content: string | undefined): unknown[] {
  if (Array.isArray(parts) && parts.length > 0) {
    return parts;
  }

  const safeContent = (content ?? '').trim();
  if (!safeContent) {
    return [];
  }

  return [textPart(safeContent)];
}

function formatMessage(message: {
  _id: string;
  _creationTime: number;
  clientMessageId?: string;
  role: 'user' | 'assistant' | 'system';
  parts?: unknown[];
  content?: string;
  redacted: boolean;
  attachments?: unknown[];
}) {
  const parts = normalizeParts(message.parts, message.content);
  const content = (message.content ?? textFromParts(parts)).trim();

  return {
    id: message.clientMessageId ?? message._id,
    role: message.role,
    parts,
    attachments: message.attachments ?? [],
    content,
    redacted: message.redacted,
    createdAt: message._creationTime,
  };
}

export const listMessages = query({
  args: {
    conversationId: v.id('conversations'),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }
    if (conversation.status !== 'open') {
      throw new Error('Conversation is archived');
    }

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();

    return messages.map((message) => formatMessage(message));
  },
});

export const createMessage = mutation({
  args: {
    conversationId: v.id('conversations'),
    messageId: v.optional(v.string()),
    role: v.optional(v.union(v.literal('user'), v.literal('assistant'), v.literal('system'))),
    content: v.optional(v.string()),
    parts: v.optional(v.array(v.any())),
    attachments: v.optional(v.array(v.any())),
    redacted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }
    if (conversation.status !== 'open') {
      throw new Error('Conversation is archived');
    }

    const normalizedParts = normalizeParts(args.parts, args.content);
    const cleanedContent = (args.content ?? textFromParts(normalizedParts)).trim();
    if (normalizedParts.length === 0 && cleanedContent.length === 0) {
      throw new Error('Message content cannot be empty');
    }

    const messageId = await ctx.db.insert('messages', {
      orgId: context.organization._id,
      conversationId: args.conversationId,
      authorUserId: context.user._id,
      clientMessageId: args.messageId,
      role: args.role ?? 'user',
      content: cleanedContent || undefined,
      parts: normalizedParts,
      attachments: args.attachments ?? [],
      redacted: args.redacted ?? false,
    });

    return {
      id: args.messageId ?? messageId,
      role: args.role ?? 'user',
      parts: normalizedParts,
      attachments: args.attachments ?? [],
      content: cleanedContent,
      redacted: args.redacted ?? false,
      createdAt: Date.now(),
    };
  },
});

export const upsertMessages = mutation({
  args: {
    conversationId: v.id('conversations'),
    messages: v.array(
      v.object({
        messageId: v.string(),
        role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
        parts: v.array(v.any()),
        attachments: v.optional(v.array(v.any())),
        redacted: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const persisted: Array<{
      id: string;
      role: 'user' | 'assistant' | 'system';
      parts: unknown[];
      attachments: unknown[];
      content: string;
      redacted: boolean;
      createdAt: number;
    }> = [];

    for (const message of args.messages) {
      const parts = normalizeParts(message.parts, undefined);
      const content = textFromParts(parts);
      const redacted = message.redacted ?? false;
      const attachments = message.attachments ?? [];

      const existing = await ctx.db
        .query('messages')
        .withIndex('by_org_conversation_client_message', (q) =>
          q
            .eq('orgId', context.organization._id)
            .eq('conversationId', args.conversationId)
            .eq('clientMessageId', message.messageId),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          role: message.role,
          parts,
          attachments,
          content: content || undefined,
          redacted,
        });

        persisted.push({
          id: message.messageId,
          role: message.role,
          parts,
          attachments,
          content,
          redacted,
          createdAt: existing._creationTime,
        });
        continue;
      }

      const insertedId = await ctx.db.insert('messages', {
        orgId: context.organization._id,
        conversationId: args.conversationId,
        authorUserId: context.user._id,
        clientMessageId: message.messageId,
        role: message.role,
        parts,
        attachments,
        content: content || undefined,
        redacted,
      });

      persisted.push({
        id: message.messageId || insertedId,
        role: message.role,
        parts,
        attachments,
        content,
        redacted,
        createdAt: Date.now(),
      });
    }

    return persisted;
  },
});

export const countRecentUserMessagesByActor = query({
  args: {
    windowStart: v.number(),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_org_author', (q) =>
        q.eq('orgId', context.organization._id).eq('authorUserId', context.user._id),
      )
      .filter((q) =>
        q.and(q.eq(q.field('role'), 'user'), q.gte(q.field('_creationTime'), args.windowStart)),
      )
      .collect();

    return messages.length;
  },
});
