import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAdminContext } from '@/lib/server/admin/context';
import type { AdminApprovalRequest } from '@/lib/server/admin/types';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { listApprovalRequests, type ApprovalStatus } from '@/lib/server/domain/approvals';

function parseStatus(value: string | null): ApprovalStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'pending' || value === 'approved' || value === 'rejected') {
    return value;
  }

  throw new ApiError(400, 'INVALID_ARGUMENT', 'status must be one of pending, approved, rejected');
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 100;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'limit must be a number');
  }

  return Math.max(1, Math.min(Math.floor(parsed), 200));
}

function toAdminApproval(request: {
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
}): AdminApprovalRequest {
  return {
    id: request.id,
    orgId: request.orgId,
    requestedByUserId: request.requestedByUserId,
    action: request.action,
    resource: request.resource,
    justification: request.justification,
    status: request.status,
    conversationId: request.conversationId,
    metadata: request.metadata,
    createdAt: request.createdAt,
    decidedAt: request.decidedAt,
  };
}

export async function GET(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();

    const { searchParams } = new URL(request.url);
    const status = parseStatus(searchParams.get('status'));
    const limit = parseLimit(searchParams.get('limit'));

    const approvals = await listApprovalRequests({
      orgId: context.orgId,
      status,
      limit,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.approval.list',
      resource: 'approval_request',
      status: 'success',
      payload: {
        status: status ?? null,
        count: approvals.length,
      },
    });
    auditLogged = true;

    return Response.json({ approvals: approvals.map(toAdminApproval) });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.approval.list',
          resource: 'approval_request',
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
