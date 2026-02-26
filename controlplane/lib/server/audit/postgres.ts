import { getDbPool } from '@/lib/server/db/pool';

export type AuditStatus = 'success' | 'denied' | 'failed';

export type AuditWriteInput = {
  orgId: string;
  actorId: string;
  action: string;
  resource: string;
  payload: Record<string, unknown>;
};

export async function insertAuditEvent(input: AuditWriteInput): Promise<string> {
  const client = getDbPool();
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO audit_events (org_id, actor_id, action, resource, payload_json)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id
    `,
    [input.orgId, input.actorId, input.action, input.resource, JSON.stringify(input.payload)],
  );

  return result.rows[0]?.id ?? '';
}
