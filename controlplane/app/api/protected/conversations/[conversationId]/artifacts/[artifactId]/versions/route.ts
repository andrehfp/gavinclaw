import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, requireAuthenticatedContext, toApiErrorResponse } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

type ArtifactVersionsRouteParams = {
  params: Promise<{ conversationId: string; artifactId: string }>;
};

export async function GET(
  _request: Request,
  { params }: ArtifactVersionsRouteParams,
) {
  let context;
  let conversationId: string | null = null;
  let artifactId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId, artifactId } = await params);

    const client = getServerConvexClient(context.accessToken);
    const artifact = await client.query(api.artifacts.getArtifact, {
      artifactId: artifactId as Id<'artifacts'>,
    });

    if (!artifact || artifact.conversationId !== conversationId) {
      throw new ApiError(404, 'NOT_FOUND', 'Artifact not found');
    }

    const versions = await client.query(api.artifacts.listArtifactVersions, {
      artifactId: artifactId as Id<'artifacts'>,
      limit: 100,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'artifact.version.list',
      resource: 'artifact',
      status: 'success',
      payload: {
        conversationId,
        artifactId,
        count: versions.length,
      },
    });
    auditLogged = true;

    return Response.json({ versions });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'artifact.version.list',
          resource: 'artifact',
          status: 'failed',
          payload: {
            ...(conversationId ? { conversationId } : {}),
            ...(artifactId ? { artifactId } : {}),
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
