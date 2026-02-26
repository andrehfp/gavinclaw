import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

export const logEvent = mutation({
  args: {
    action: v.string(),
    resource: v.string(),
    status: v.union(v.literal('success'), v.literal('denied'), v.literal('failed')),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const id = await ctx.db.insert('auditEvents', {
      orgId: context.organization._id,
      actorUserId: context.user._id,
      action: args.action,
      resource: args.resource,
      status: args.status,
      payload: args.payload ?? {},
    });

    return { id };
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin']);

    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
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
