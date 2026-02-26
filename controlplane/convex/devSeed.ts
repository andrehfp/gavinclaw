import { mutation } from './_generated/server';

export const seedFoundation = mutation({
  args: {},
  handler: async (ctx) => {
    const orgExternalId = 'org_local_seed';
    const userExternalId = 'user_local_admin';

    let organization = await ctx.db
      .query('organizations')
      .withIndex('by_external_id', (q) => q.eq('externalId', orgExternalId))
      .unique();

    if (!organization) {
      const orgId = await ctx.db.insert('organizations', {
        externalId: orgExternalId,
        name: 'Local Seed Org',
        isPersonal: false,
      });
      organization = await ctx.db.get(orgId);
    }

    if (!organization) {
      throw new Error('Failed to create seed organization');
    }

    let user = await ctx.db
      .query('users')
      .withIndex('by_external_id', (q) => q.eq('externalId', userExternalId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert('users', {
        externalId: userExternalId,
        email: 'admin@local.seed',
        name: 'Local Admin',
      });
      user = await ctx.db.get(userId);
    }

    if (!user) {
      throw new Error('Failed to create seed user');
    }

    const membership = await ctx.db
      .query('memberships')
      .withIndex('by_org_user', (q) => q.eq('orgId', organization._id).eq('userId', user._id))
      .unique();

    if (!membership) {
      await ctx.db.insert('memberships', {
        orgId: organization._id,
        userId: user._id,
        role: 'admin',
        status: 'active',
        source: 'local',
      });
    }

    const existingConversation = await ctx.db
      .query('conversations')
      .withIndex('by_org', (q) => q.eq('orgId', organization._id))
      .first();

    if (!existingConversation) {
      const conversationId = await ctx.db.insert('conversations', {
        orgId: organization._id,
        createdByUserId: user._id,
        title: 'Seed conversation',
        status: 'open',
      });

      await ctx.db.insert('messages', {
        orgId: organization._id,
        conversationId,
        authorUserId: user._id,
        role: 'system',
        content: 'Seed message for local development.',
        redacted: false,
      });
    }

    return {
      organizationExternalId: organization.externalId,
      userExternalId: user.externalId,
      seeded: true,
    };
  },
});
