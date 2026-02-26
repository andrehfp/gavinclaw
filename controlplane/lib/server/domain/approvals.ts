import { getDbPool } from '@/lib/server/db/pool';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalDecision = 'approved' | 'rejected';

type ApprovalRequestRow = {
  id: string;
  org_external_id: string;
  requested_by_external_id: string;
  action: string;
  resource: string;
  justification: string | null;
  status: ApprovalStatus;
  conversation_external_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  decided_at: string | null;
};

export type ApprovalRequest = {
  id: string;
  orgId: string;
  requestedByUserId: string;
  action: string;
  resource: string;
  justification: string | null;
  status: ApprovalStatus;
  conversationId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  decidedAt: string | null;
};

export async function createApprovalRequest(input: {
  orgId: string;
  requestedByUserId: string;
  action: string;
  resource: string;
  justification?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<ApprovalRequest> {
  const pool = getDbPool();

  const result = await pool.query<ApprovalRequestRow>(
    `
      WITH org_ctx AS (
        SELECT id, external_id
        FROM organizations
        WHERE external_id = $1
      ),
      user_ctx AS (
        SELECT id, external_id
        FROM users
        WHERE external_id = $2
      )
      INSERT INTO approval_requests (
        org_id,
        requested_by_user_id,
        action,
        resource,
        justification,
        status,
        conversation_external_id,
        metadata_json
      )
      SELECT
        org_ctx.id,
        user_ctx.id,
        $3,
        $4,
        $5,
        'pending'::approval_status,
        $6,
        $7::jsonb
      FROM org_ctx, user_ctx
      RETURNING
        approval_requests.id,
        (SELECT external_id FROM organizations WHERE id = approval_requests.org_id) AS org_external_id,
        (SELECT external_id FROM users WHERE id = approval_requests.requested_by_user_id) AS requested_by_external_id,
        approval_requests.action,
        approval_requests.resource,
        approval_requests.justification,
        approval_requests.status,
        approval_requests.conversation_external_id,
        approval_requests.metadata_json,
        approval_requests.created_at,
        approval_requests.decided_at
    `,
    [
      input.orgId,
      input.requestedByUserId,
      input.action,
      input.resource,
      input.justification ?? null,
      input.conversationId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Could not create approval request. Ensure org and user are provisioned in Postgres.');
  }

  return toApprovalRequest(row);
}

export async function listPendingApprovalRequests(input: {
  orgId: string;
  limit?: number;
}): Promise<ApprovalRequest[]> {
  return listApprovalRequests({
    orgId: input.orgId,
    status: 'pending',
    limit: input.limit,
  });
}

export async function listApprovalRequests(input: {
  orgId: string;
  status?: ApprovalStatus;
  limit?: number;
}): Promise<ApprovalRequest[]> {
  const pool = getDbPool();
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200));

  const result = await pool.query<ApprovalRequestRow>(
    `
      SELECT
        ar.id,
        o.external_id AS org_external_id,
        u.external_id AS requested_by_external_id,
        ar.action,
        ar.resource,
        ar.justification,
        ar.status,
        ar.conversation_external_id,
        ar.metadata_json,
        ar.created_at,
        ar.decided_at
      FROM approval_requests ar
      JOIN organizations o ON o.id = ar.org_id
      JOIN users u ON u.id = ar.requested_by_user_id
      WHERE o.external_id = $1
        AND ($2::approval_status IS NULL OR ar.status = $2::approval_status)
      ORDER BY ar.created_at DESC
      LIMIT $3
    `,
    [input.orgId, input.status ?? null, limit],
  );

  return result.rows.map(toApprovalRequest);
}

export async function decideApprovalRequest(input: {
  orgId: string;
  requestId: string;
  decidedByUserId: string;
  decision: ApprovalDecision;
  justification?: string;
}): Promise<ApprovalRequest> {
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query<{ id: string; org_internal_id: string; status: ApprovalStatus }>(
      `
        SELECT ar.id, ar.org_id AS org_internal_id, ar.status
        FROM approval_requests ar
        JOIN organizations o ON o.id = ar.org_id
        WHERE ar.id = $1
          AND o.external_id = $2
        LIMIT 1
      `,
      [input.requestId, input.orgId],
    );

    const request = requestResult.rows[0];
    if (!request) {
      throw new Error('Approval request not found in the target organization');
    }

    if (request.status !== 'pending') {
      throw new Error(`Approval request is already ${request.status}`);
    }

    const deciderResult = await client.query<{ id: string }>(
      `
        SELECT id
        FROM users
        WHERE external_id = $1
        LIMIT 1
      `,
      [input.decidedByUserId],
    );

    const decider = deciderResult.rows[0];
    if (!decider) {
      throw new Error('Decider user is not provisioned in Postgres');
    }

    await client.query(
      `
        INSERT INTO approval_decisions (org_id, request_id, decided_by_user_id, decision, justification)
        VALUES ($1, $2, $3, $4::approval_decision, $5)
      `,
      [request.org_internal_id, input.requestId, decider.id, input.decision, input.justification ?? null],
    );

    await client.query(
      `
        UPDATE approval_requests
        SET status = $2::approval_status,
            decided_at = NOW()
        WHERE id = $1
      `,
      [input.requestId, input.decision],
    );

    const updatedResult = await client.query<ApprovalRequestRow>(
      `
        SELECT
          ar.id,
          o.external_id AS org_external_id,
          u.external_id AS requested_by_external_id,
          ar.action,
          ar.resource,
          ar.justification,
          ar.status,
          ar.conversation_external_id,
          ar.metadata_json,
          ar.created_at,
          ar.decided_at
        FROM approval_requests ar
        JOIN organizations o ON o.id = ar.org_id
        JOIN users u ON u.id = ar.requested_by_user_id
        WHERE ar.id = $1
        LIMIT 1
      `,
      [input.requestId],
    );

    await client.query('COMMIT');

    const updated = updatedResult.rows[0];
    if (!updated) {
      throw new Error('Approval request updated but could not be reloaded');
    }

    return toApprovalRequest(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function toApprovalRequest(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id,
    orgId: row.org_external_id,
    requestedByUserId: row.requested_by_external_id,
    action: row.action,
    resource: row.resource,
    justification: row.justification,
    status: row.status,
    conversationId: row.conversation_external_id,
    metadata: row.metadata_json ?? {},
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}
