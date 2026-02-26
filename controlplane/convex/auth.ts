import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertRole, ensureSessionContext, resolveExistingSessionContext, toPublicSessionContext } from './lib/auth';

const roleValidator = v.union(v.literal('admin'), v.literal('user'));

export const ensureSession = mutation({
  args: {},
  handler: async (ctx) => {
    const context = await ensureSessionContext(ctx);
    const conversations = await ctx.db
      .query('conversations')
      .withIndex('by_org', (q) => q.eq('orgId', context.organization._id))
      .collect();

    return {
      ...toPublicSessionContext(context),
      conversationCount: conversations.length,
    };
  },
});

export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const context = await resolveExistingSessionContext(ctx);
    const conversations = await ctx.db
      .query('conversations')
      .withIndex('by_org', (q) => q.eq('orgId', context.organization._id))
      .collect();

    return {
      ...toPublicSessionContext(context),
      conversationCount: conversations.length,
    };
  },
});

export const setMembershipRole = mutation({
  args: {
    userExternalId: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const callerContext = await resolveExistingSessionContext(ctx);
    assertRole(callerContext.membership.role, ['admin']);
    throw new Error(
      `Role updates are managed in WorkOS. Update ${args.userExternalId} to ${args.role} in WorkOS org ${callerContext.organization.externalId}.`,
    );
  },
});
