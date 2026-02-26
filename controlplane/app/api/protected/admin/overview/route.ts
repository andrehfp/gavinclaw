import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import type { AdminOverview } from '@/lib/server/admin/types';
import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { requireAdminContext } from '@/lib/server/admin/context';
import { getDbPool } from '@/lib/server/db/pool';
import { getServerConvexClient } from '@/lib/server/convex-client';

type OverviewRow = {
  members_total: string;
  admins_total: string;
  users_total: string;
  pending_approvals: string;
  active_policies: string;
  recent_audit_count_24h: string;
};

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export async function GET() {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();

    const db = getDbPool();
    const result = await db.query<OverviewRow>(
      `
        WITH org_ctx AS (
          SELECT id, external_id
          FROM organizations
          WHERE external_id = $1
          LIMIT 1
        )
        SELECT
          COUNT(*) FILTER (WHERE m.status IN ('active'::membership_status, 'invited'::membership_status))::text AS members_total,
          COUNT(*) FILTER (
            WHERE m.status IN ('active'::membership_status, 'invited'::membership_status)
              AND m.role = 'admin'::membership_role
          )::text AS admins_total,
          COUNT(*) FILTER (
            WHERE m.status IN ('active'::membership_status, 'invited'::membership_status)
              AND m.role = 'user'::membership_role
          )::text AS users_total,
          (
            SELECT COUNT(*)::text
            FROM approval_requests ar
            JOIN org_ctx o ON o.id = ar.org_id
            WHERE ar.status = 'pending'::approval_status
          ) AS pending_approvals,
          (
            SELECT COUNT(*)::text
            FROM policy_rules p
            JOIN org_ctx o ON o.id = p.org_id
            WHERE p.enabled = TRUE
          ) AS active_policies,
          (
            SELECT COUNT(*)::text
            FROM audit_events ae
            JOIN org_ctx o ON o.external_id = ae.org_id
            WHERE ae.ts >= NOW() - INTERVAL '24 hours'
          ) AS recent_audit_count_24h
        FROM org_ctx o
        LEFT JOIN memberships m ON m.org_id = o.id
      `,
      [context.orgId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new ApiError(404, 'ORG_NOT_FOUND', 'Organization not found for current session');
    }

    const convex = getServerConvexClient(context.accessToken);
    const conversations = await convex.query(api.conversations.listConversations, {});

    const messageLists = await Promise.all(
      conversations.map((conversation) =>
        convex.query(api.messages.listMessages, {
          conversationId: conversation.id as Id<'conversations'>,
        })),
    );

    const overview: AdminOverview = {
      membersTotal: toNumber(row.members_total),
      adminsTotal: toNumber(row.admins_total),
      usersTotal: toNumber(row.users_total),
      conversationsTotal: conversations.length,
      messagesTotal: messageLists.reduce((sum, messages) => sum + messages.length, 0),
      pendingApprovals: toNumber(row.pending_approvals),
      activePolicies: toNumber(row.active_policies),
      recentAuditCount24h: toNumber(row.recent_audit_count_24h),
    };

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.overview.read',
      resource: 'admin_overview',
      status: 'success',
      payload: {
        role: context.role,
      },
    });
    auditLogged = true;

    return Response.json({ overview });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.overview.read',
          resource: 'admin_overview',
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
