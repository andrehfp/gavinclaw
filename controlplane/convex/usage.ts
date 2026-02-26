import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

export const recordQueryUsage = mutation({
  args: {
    conversationId: v.id('conversations'),
    provider: v.string(),
    modelId: v.string(),
    providerModelId: v.string(),
    finishReason: v.optional(v.string()),
    stepCount: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    providerCostUsd: v.optional(v.number()),
    providerCostSource: v.optional(v.string()),
    providerResponseId: v.optional(v.string()),
    usageRaw: v.optional(v.any()),
    providerMetadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const id = await ctx.db.insert('queryUsages', {
      orgId: context.organization._id,
      conversationId: args.conversationId,
      actorUserId: context.user._id,
      provider: args.provider,
      modelId: args.modelId,
      providerModelId: args.providerModelId,
      finishReason: args.finishReason,
      stepCount: args.stepCount,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      reasoningTokens: args.reasoningTokens,
      cacheReadTokens: args.cacheReadTokens,
      cacheWriteTokens: args.cacheWriteTokens,
      providerCostUsd: args.providerCostUsd,
      providerCostSource: args.providerCostSource,
      providerResponseId: args.providerResponseId,
      usageRaw: args.usageRaw,
      providerMetadata: args.providerMetadata,
    });

    return {
      id,
      conversationId: args.conversationId,
      provider: args.provider,
      modelId: args.modelId,
      providerModelId: args.providerModelId,
      finishReason: args.finishReason ?? null,
      stepCount: args.stepCount,
      totalTokens: args.totalTokens ?? null,
      providerCostUsd: args.providerCostUsd ?? null,
    };
  },
});

export const listConversationQueryUsage = query({
  args: {
    conversationId: v.id('conversations'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.orgId !== context.organization._id) {
      throw new Error('Conversation not found');
    }

    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const rows = await ctx.db
      .query('queryUsages')
      .withIndex('by_org_conversation', (q) =>
        q.eq('orgId', context.organization._id).eq('conversationId', args.conversationId),
      )
      .order('desc')
      .take(limit);

    return rows.map((row) => ({
      id: row._id,
      createdAt: row._creationTime,
      provider: row.provider,
      modelId: row.modelId,
      providerModelId: row.providerModelId,
      finishReason: row.finishReason ?? null,
      stepCount: row.stepCount,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      totalTokens: row.totalTokens ?? null,
      reasoningTokens: row.reasoningTokens ?? null,
      cacheReadTokens: row.cacheReadTokens ?? null,
      cacheWriteTokens: row.cacheWriteTokens ?? null,
      providerCostUsd: row.providerCostUsd ?? null,
      providerCostSource: row.providerCostSource ?? null,
      providerResponseId: row.providerResponseId ?? null,
      usageRaw: row.usageRaw ?? null,
      providerMetadata: row.providerMetadata ?? null,
    }));
  },
});
