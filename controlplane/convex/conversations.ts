import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

function toConversationResult(conversation: {
  _id: Id<'conversations'>;
  _creationTime: number;
  title: string;
  status: 'open' | 'closed';
  projectId?: Id<'projects'>;
  forkedFromConversationId?: Id<'conversations'>;
  pinnedAt?: number;
}) {
  return {
    id: conversation._id,
    title: conversation.title,
    status: conversation.status,
    createdAt: conversation._creationTime,
    projectId: conversation.projectId ?? null,
    forkedFromConversationId: conversation.forkedFromConversationId ?? null,
    pinnedAt: conversation.pinnedAt ?? null,
  };
}

async function resolveAssignableProject(
  ctx: MutationCtx,
  context: Awaited<ReturnType<typeof resolveExistingSessionContext>>,
  projectId: Id<'projects'>,
): Promise<Doc<'projects'>> {
  const project = await ctx.db.get(projectId);
  if (!project || project.orgId !== context.organization._id) {
    throw new Error('Project not found');
  }

  if (project.visibility === 'private' && project.createdByUserId !== context.user._id) {
    throw new Error('Project not found');
  }

  return project;
}

export const listConversations = query({
  args: {
    limit: v.optional(v.number()),
    status: v.optional(v.union(v.literal('open'), v.literal('closed'))),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversationsQuery = ctx.db
      .query('conversations')
      .withIndex('by_org', (q) => q.eq('orgId', context.organization._id))
      .order('desc');

    const limit = args.limit !== undefined ? Math.max(1, Math.min(args.limit, 500)) : undefined;
    const conversations = args.status
      ? await (limit !== undefined
        ? conversationsQuery
          .filter((q) => q.eq(q.field('status'), args.status))
          .take(limit)
        : conversationsQuery
          .filter((q) => q.eq(q.field('status'), args.status))
          .collect())
      : await (limit !== undefined ? conversationsQuery.take(limit) : conversationsQuery.collect());

    return conversations.map((conversation) => toConversationResult(conversation));
  },
});

export const createConversation = mutation({
  args: {
    title: v.string(),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const cleanedTitle = args.title.trim();
    if (cleanedTitle.length === 0) {
      throw new Error('Conversation title cannot be empty');
    }

    let projectId: Id<'projects'> | undefined;
    if (args.projectId) {
      const project = await resolveAssignableProject(ctx, context, args.projectId);
      projectId = project._id;
    }

    const id = await ctx.db.insert('conversations', {
      orgId: context.organization._id,
      createdByUserId: context.user._id,
      title: cleanedTitle,
      status: 'open',
      projectId,
    });

    return {
      id,
      title: cleanedTitle,
      status: 'open' as const,
      createdAt: Date.now(),
      projectId: projectId ?? null,
      forkedFromConversationId: null,
      pinnedAt: null,
    };
  },
});

export const forkConversation = mutation({
  args: {
    sourceConversationId: v.id('conversations'),
    upToMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const sourceConversation = await ctx.db.get(args.sourceConversationId);
    if (!sourceConversation || sourceConversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const sourceMessages = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', sourceConversation._id))
      .collect();

    const messagesToCopy: typeof sourceMessages = [];
    let targetMessageFound = false;

    for (const message of sourceMessages) {
      messagesToCopy.push(message);
      const messageId = message.clientMessageId ?? message._id;
      if (messageId === args.upToMessageId) {
        targetMessageFound = true;
        break;
      }
    }

    if (!targetMessageFound) {
      throw new Error('Message not found');
    }

    const forkedConversationId = await ctx.db.insert('conversations', {
      orgId: context.organization._id,
      createdByUserId: context.user._id,
      title: sourceConversation.title,
      status: 'open',
      projectId: sourceConversation.projectId,
      forkedFromConversationId: sourceConversation._id,
    });

    for (const message of messagesToCopy) {
      await ctx.db.insert('messages', {
        orgId: context.organization._id,
        conversationId: forkedConversationId,
        authorUserId: message.authorUserId,
        clientMessageId: message.clientMessageId,
        role: message.role,
        content: message.content,
        parts: message.parts,
        attachments: message.attachments,
        redacted: message.redacted,
      });
    }

    const forkedConversation = await ctx.db.get(forkedConversationId);
    if (!forkedConversation) {
      throw new Error('Could not create forked conversation');
    }

    return toConversationResult(forkedConversation);
  },
});

export const renameConversation = mutation({
  args: {
    conversationId: v.id('conversations'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const cleanedTitle = args.title.trim();
    if (cleanedTitle.length === 0) {
      throw new Error('Conversation title cannot be empty');
    }

    await ctx.db.patch(args.conversationId, {
      title: cleanedTitle,
    });

    return toConversationResult({
      ...conversation,
      title: cleanedTitle,
    });
  },
});

export const deleteConversation = mutation({
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

    const messages = await ctx.db
      .query('messages')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    const artifacts = await ctx.db
      .query('artifacts')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .collect();

    for (const artifact of artifacts) {
      const versions = await ctx.db
        .query('artifactVersions')
        .withIndex('by_conversation_artifact', (q) =>
          q.eq('conversationId', args.conversationId).eq('artifactId', artifact._id),
        )
        .collect();

      for (const version of versions) {
        await ctx.db.delete(version._id);
      }

      await ctx.db.delete(artifact._id);
    }

    await ctx.db.delete(args.conversationId);

    return toConversationResult(conversation);
  },
});

export const getConversation = query({
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

    return toConversationResult(conversation);
  },
});

export const assignConversationProject = mutation({
  args: {
    conversationId: v.id('conversations'),
    projectId: v.optional(v.id('projects')),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    let projectId: Id<'projects'> | undefined;
    if (args.projectId) {
      const project = await resolveAssignableProject(ctx, context, args.projectId);
      projectId = project._id;
    }

    await ctx.db.patch(args.conversationId, {
      projectId,
    });

    return toConversationResult({
      ...conversation,
      projectId,
    });
  },
});

export const setConversationPinned = mutation({
  args: {
    conversationId: v.id('conversations'),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const pinnedAt = args.pinned ? Date.now() : undefined;
    await ctx.db.patch(args.conversationId, {
      pinnedAt,
    });

    return toConversationResult({
      ...conversation,
      pinnedAt,
    });
  },
});

export const setConversationArchived = mutation({
  args: {
    conversationId: v.id('conversations'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const status = args.archived ? 'closed' : 'open';
    await ctx.db.patch(args.conversationId, {
      status,
    });

    return toConversationResult({
      ...conversation,
      status,
    });
  },
});
