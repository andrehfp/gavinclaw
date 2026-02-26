import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

function toArtifactSummary(artifact: Doc<'artifacts'>) {
  return {
    id: artifact._id,
    conversationId: artifact.conversationId,
    title: artifact.title,
    kind: artifact.kind,
    status: artifact.status,
    latestVersion: artifact.latestVersion,
    createdAt: artifact._creationTime,
    updatedAt: artifact.updatedAt,
  };
}

function toArtifactVersion(version: Doc<'artifactVersions'>) {
  return {
    id: version._id,
    artifactId: version.artifactId,
    version: version.version,
    content: version.content,
    changeSummary: version.changeSummary ?? null,
    createdAt: version._creationTime,
  };
}

async function resolveConversationOrThrow(
  ctx: QueryCtx | MutationCtx,
  conversationId: Doc<'artifacts'>['conversationId'],
  orgId: Doc<'organizations'>['_id'],
) {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation || conversation.orgId !== orgId) {
    throw new Error('Conversation not found');
  }
  return conversation;
}

async function resolveArtifactOrThrow(
  ctx: QueryCtx | MutationCtx,
  artifactId: Doc<'artifacts'>['_id'],
  orgId: Doc<'organizations'>['_id'],
) {
  const artifact = await ctx.db.get(artifactId);
  if (!artifact || artifact.orgId !== orgId) {
    throw new Error('Artifact not found');
  }

  return artifact;
}

export const listArtifactsByConversation = query({
  args: {
    conversationId: v.id('conversations'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    await resolveConversationOrThrow(ctx, args.conversationId, context.organization._id);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 100));
    const artifacts = await ctx.db
      .query('artifacts')
      .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
      .order('desc')
      .take(limit);

    return artifacts.map((artifact) => toArtifactSummary(artifact));
  },
});

export const getArtifact = query({
  args: {
    artifactId: v.id('artifacts'),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const artifact = await resolveArtifactOrThrow(ctx, args.artifactId, context.organization._id);

    let content: string | null = null;
    if (artifact.latestVersion > 0) {
      const latestVersion = await ctx.db
        .query('artifactVersions')
        .withIndex('by_artifact_version', (q) =>
          q.eq('artifactId', artifact._id).eq('version', artifact.latestVersion),
        )
        .first();

      content = latestVersion?.content ?? null;
    }

    return {
      ...toArtifactSummary(artifact),
      content,
    };
  },
});

export const listArtifactVersions = query({
  args: {
    artifactId: v.id('artifacts'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const artifact = await resolveArtifactOrThrow(ctx, args.artifactId, context.organization._id);

    const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
    const versions = await ctx.db
      .query('artifactVersions')
      .withIndex('by_conversation_artifact', (q) =>
        q.eq('conversationId', artifact.conversationId).eq('artifactId', artifact._id),
      )
      .order('desc')
      .take(limit);

    return versions.map((version) => toArtifactVersion(version));
  },
});

export const createArtifact = mutation({
  args: {
    conversationId: v.id('conversations'),
    title: v.string(),
    kind: v.union(v.literal('text'), v.literal('code')),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    await resolveConversationOrThrow(ctx, args.conversationId, context.organization._id);

    const title = args.title.trim();
    if (title.length === 0) {
      throw new Error('Artifact title cannot be empty');
    }
    if (title.length > 200) {
      throw new Error('Artifact title is too long');
    }

    const now = Date.now();
    const artifactId = await ctx.db.insert('artifacts', {
      orgId: context.organization._id,
      conversationId: args.conversationId,
      createdByUserId: context.user._id,
      title,
      kind: args.kind,
      status: 'active',
      latestVersion: 0,
      updatedAt: now,
    });

    const artifact = await ctx.db.get(artifactId);
    if (!artifact) {
      throw new Error('Could not create artifact');
    }

    return toArtifactSummary(artifact);
  },
});

export const appendArtifactVersion = mutation({
  args: {
    artifactId: v.id('artifacts'),
    content: v.string(),
    changeSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const artifact = await resolveArtifactOrThrow(ctx, args.artifactId, context.organization._id);

    const content = args.content.trim();
    if (content.length === 0) {
      throw new Error('Artifact content cannot be empty');
    }

    const nextVersion = artifact.latestVersion + 1;
    await ctx.db.insert('artifactVersions', {
      orgId: context.organization._id,
      conversationId: artifact.conversationId,
      artifactId: artifact._id,
      version: nextVersion,
      content,
      changeSummary: args.changeSummary?.trim() || undefined,
      createdByUserId: context.user._id,
    });

    const updatedAt = Date.now();
    await ctx.db.patch(artifact._id, {
      latestVersion: nextVersion,
      updatedAt,
    });

    return {
      ...toArtifactSummary({
        ...artifact,
        latestVersion: nextVersion,
        updatedAt,
      }),
      version: nextVersion,
      content,
    };
  },
});
