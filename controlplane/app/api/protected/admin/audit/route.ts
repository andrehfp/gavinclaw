import type { AdminAuditEvent, AdminAuditStatus } from '@/lib/server/admin/types';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAdminContext } from '@/lib/server/admin/context';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { getDbPool } from '@/lib/server/db/pool';

type AuditRow = {
  id: string;
  ts: string;
  org_id: string;
  actor_id: string;
  action: string;
  resource: string;
  payload_json: Record<string, unknown>;
};

type AuditCursor = {
  ts: string;
  id: string;
};

function parseLimit(input: string | null): number {
  if (!input) {
    return 50;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'limit must be a number');
  }

  return Math.max(1, Math.min(Math.floor(parsed), 200));
}

function parseStatus(input: string | null): AdminAuditStatus | null {
  if (!input) {
    return null;
  }

  if (input === 'success' || input === 'denied' || input === 'failed') {
    return input;
  }

  throw new ApiError(400, 'INVALID_ARGUMENT', 'status must be one of success, denied, failed');
}

function encodeCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string | null): AuditCursor | null {
  if (!raw) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown;
    if (
      typeof decoded !== 'object'
      || decoded === null
      || typeof (decoded as { ts?: unknown }).ts !== 'string'
      || typeof (decoded as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Invalid cursor shape');
    }

    return {
      ts: (decoded as { ts: string }).ts,
      id: (decoded as { id: string }).id,
    };
  } catch {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'cursor is invalid');
  }
}

function toAuditStatus(payload: Record<string, unknown>): AdminAuditStatus {
  const raw = payload.status;
  if (raw === 'success' || raw === 'denied' || raw === 'failed') {
    return raw;
  }

  return 'failed';
}

export async function GET(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();

    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const action = searchParams.get('action')?.trim() || null;
    const actor = searchParams.get('actor')?.trim() || null;
    const status = parseStatus(searchParams.get('status'));
    const cursor = decodeCursor(searchParams.get('cursor'));

    const db = getDbPool();
    const result = await db.query<AuditRow>(
      `
        SELECT id, ts, org_id, actor_id, action, resource, payload_json
        FROM audit_events
        WHERE org_id = $1
          AND ($2::text IS NULL OR action = $2)
          AND ($3::text IS NULL OR actor_id = $3)
          AND ($4::text IS NULL OR payload_json->>'status' = $4)
          AND (
            $5::timestamptz IS NULL
            OR ts < $5::timestamptz
            OR (ts = $5::timestamptz AND id::text < $6::text)
          )
        ORDER BY ts DESC, id DESC
        LIMIT $7
      `,
      [context.orgId, action, actor, status, cursor?.ts ?? null, cursor?.id ?? null, limit + 1],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    const events: AdminAuditEvent[] = rows.map((row) => ({
      id: row.id,
      ts: row.ts,
      orgId: row.org_id,
      actorId: row.actor_id,
      action: row.action,
      resource: row.resource,
      status: toAuditStatus(row.payload_json ?? {}),
      payload: row.payload_json ?? {},
    }));

    const lastRow = rows.at(-1);
    const nextCursor = hasMore && lastRow
      ? encodeCursor({
          ts: lastRow.ts,
          id: lastRow.id,
        })
      : null;

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.audit.list',
      resource: 'audit_event',
      status: 'success',
      payload: {
        count: events.length,
      },
    });
    auditLogged = true;

    return Response.json({ events, nextCursor });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.audit.list',
          resource: 'audit_event',
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'failed',
          payload: {
            reason: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      } catch {
        // Primary failure is returned below.
      }
    }

    return toApiErrorResponse(error);
  }
}
