import { api } from '@/convex/_generated/api';
import { getServerConvexClient } from '@/lib/server/convex-client';
import { insertAuditEvent } from '@/lib/server/audit/postgres';

type MirrorAuditInput = {
  accessToken: string;
  orgId: string;
  actorId: string;
  action: string;
  resource: string;
  status: 'success' | 'denied' | 'failed';
  payload?: Record<string, unknown>;
};

export async function mirrorAuditEvent(input: MirrorAuditInput): Promise<void> {
  const payload = {
    ...(input.payload ?? {}),
    status: input.status,
  };

  await insertAuditEvent({
    orgId: input.orgId,
    actorId: input.actorId,
    action: input.action,
    resource: input.resource,
    payload,
  });

  try {
    const client = getServerConvexClient(input.accessToken);
    await client.mutation(api.audit.logEvent, {
      action: input.action,
      resource: input.resource,
      status: input.status,
      payload,
    });
  } catch {
    // Convex audit is a projection. Postgres append-only write already succeeded.
  }
}

export function queueMirrorAuditEvent(input: MirrorAuditInput): void {
  void mirrorAuditEvent(input).catch(() => {
    // Non-blocking telemetry path.
  });
}
