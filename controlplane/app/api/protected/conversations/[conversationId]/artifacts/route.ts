import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { toApiErrorResponse, requireAuthenticatedContext } from '@/lib/server/authz';
import { getServerConvexClient } from '@/lib/server/convex-client';

type ArtifactsRouteParams = {
  params: Promise<{ conversationId: string }>;
};

export async function GET(
  _request: Request,
  { params }: ArtifactsRouteParams,
) {
  let context;
  let conversationId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAuthenticatedContext();
    ({ conversationId } = await params);

    const client = getServerConvexClient(context.accessToken);
    const artifacts = await client.query(api.artifacts.listArtifactsByConversation, {
      conversationId: conversationId as Id<'conversations'>,
      limit: 100,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'artifact.list',
      resource: 'artifact',
      status: 'success',
      payload: {
        conversationId,
        count: artifacts.length,
      },
    });
    auditLogged = true;

    return Response.json({ artifacts });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'artifact.list',
          resource: 'artifact',
          status: 'failed',
          payload: {
            ...(conversationId ? { conversationId } : {}),
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
