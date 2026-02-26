import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

export const listPolicyRules = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const rules = await ctx.db
      .query('policyRules')
      .withIndex('by_org', (q) => q.eq('orgId', context.organization._id))
      .order('desc')
      .take(limit);

    return rules.map((rule) => ({
      id: rule._id,
      name: rule.name,
      mode: rule.mode,
      enabled: rule.enabled,
      createdAt: rule._creationTime,
    }));
  },
});

export const listRecentAuditEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const events = await ctx.db
      .query('auditEvents')
      .withIndex('by_org', (q) => q.eq('orgId', context.organization._id))
      .order('desc')
      .take(limit);

    return events.map((event) => ({
      id: event._id,
      action: event.action,
      resource: event.resource,
      status: event.status,
      payload: event.payload,
      createdAt: event._creationTime,
    }));
  },
});

export const createApprovalRequestDraft = mutation({
  args: {
    conversationId: v.optional(v.id('conversations')),
    action: v.string(),
    resource: v.string(),
    justification: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    if (args.conversationId) {
      const conversation = await ctx.db.get(args.conversationId);
      if (!conversation || conversation.orgId !== context.organization._id) {
        throw new Error('Conversation not found');
      }
    }

    const id = await ctx.db.insert('approvalRequests', {
      orgId: context.organization._id,
      requestedByUserId: context.user._id,
      action: args.action.trim(),
      resource: args.resource.trim(),
      justification: args.justification?.trim() || undefined,
      status: 'pending',
      conversationId: args.conversationId,
    });

    return {
      id,
      action: args.action.trim(),
      resource: args.resource.trim(),
      status: 'pending' as const,
    };
  },
});

