import { api } from '@/convex/_generated/api';
import { WRITE_ROLES } from '@/lib/rbac';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, requireRole, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

type ProjectVisibility = 'shared' | 'private';

function isProjectVisibility(value: unknown): value is ProjectVisibility {
  return value === 'shared' || value === 'private';
}

export async function GET() {
  let context;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    const client = getServerConvexClient(context.accessToken);
    const projects = await client.query(api.projects.listProjects, {});

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'project.list',
      resource: 'project',
      status: 'success',
      payload: {
        count: projects.length,
      },
    });
    auditLogged = true;

    return Response.json({
      projects,
    });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'project.list',
          resource: 'project',
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

export async function POST(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();

    let body: { name?: unknown; visibility?: unknown } = {};
    try {
      body = (await request.json()) as { name?: unknown; visibility?: unknown };
    } catch {
      body = {};
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'name is required');
    }

    const visibility = body.visibility;
    if (!isProjectVisibility(visibility)) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'visibility must be either shared or private');
    }

    try {
      requireRole(context, WRITE_ROLES);
    } catch (error) {
      queueMirrorAuditEvent({
        accessToken: context.accessToken,
        orgId: context.orgId,
        actorId: context.actorUserId,
        action: 'project.create',
        resource: 'project',
        status: 'denied',
        payload: {
          reason: error instanceof Error ? error.message : 'Role not allowed',
          role: context.role,
        },
      });
      auditLogged = true;
      throw error;
    }

    const client = getServerConvexClient(context.accessToken);
    const project = await client.mutation(api.projects.createProject, {
      name,
      visibility,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'project.create',
      resource: 'project',
      status: 'success',
      payload: {
        projectId: project.id,
        visibility: project.visibility,
      },
    });
    auditLogged = true;

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'project.create',
          resource: 'project',
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
