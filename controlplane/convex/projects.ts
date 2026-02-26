import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { assertRole, resolveExistingSessionContext } from './lib/auth';

function toProjectResult(project: {
  _id: string;
  _creationTime: number;
  name: string;
  visibility: 'shared' | 'private';
  createdByUserId: string;
}) {
  return {
    id: project._id,
    name: project.name,
    visibility: project.visibility,
    createdByUserId: project.createdByUserId,
    createdAt: project._creationTime,
  };
}

export const listProjects = query({
  args: {},
  handler: async (ctx) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const [sharedProjects, privateProjects] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_org_visibility', (q) =>
          q.eq('orgId', context.organization._id).eq('visibility', 'shared'),
        )
        .collect(),
      ctx.db
        .query('projects')
        .withIndex('by_org_creator_visibility', (q) =>
          q
            .eq('orgId', context.organization._id)
            .eq('createdByUserId', context.user._id)
            .eq('visibility', 'private'),
        )
        .collect(),
    ]);

    const projects = [...sharedProjects, ...privateProjects].sort((a, b) => b._creationTime - a._creationTime);
    return projects.map((project) => toProjectResult(project));
  },
});

export const createProject = mutation({
  args: {
    name: v.string(),
    visibility: v.union(v.literal('shared'), v.literal('private')),
  },
  handler: async (ctx, args) => {
    const context = await resolveExistingSessionContext(ctx);
    assertRole(context.membership.role, ['admin', 'user']);

    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error('Project name cannot be empty');
    }

    const id = await ctx.db.insert('projects', {
      orgId: context.organization._id,
      createdByUserId: context.user._id,
      name,
      visibility: args.visibility,
    });

    return {
      id,
      name,
      visibility: args.visibility,
      createdByUserId: context.user._id,
      createdAt: Date.now(),
    };
  },
});
