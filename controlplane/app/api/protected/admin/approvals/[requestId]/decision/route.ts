import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAdminContext } from '@/lib/server/admin/context';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { decideApprovalRequest, type ApprovalDecision } from '@/lib/server/domain/approvals';

function parseDecision(value: unknown): ApprovalDecision {
  if (value === 'approved' || value === 'rejected') {
    return value;
  }

  throw new ApiError(400, 'INVALID_ARGUMENT', 'decision must be approved or rejected');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  let context;
  let requestId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    ({ requestId } = await params);

    let body: { decision?: unknown; justification?: unknown } = {};
    try {
      body = (await request.json()) as { decision?: unknown; justification?: unknown };
    } catch {
      body = {};
    }

    const decision = parseDecision(body.decision);
    const justification = typeof body.justification === 'string' && body.justification.trim().length > 0
      ? body.justification.trim()
      : undefined;

    const approval = await decideApprovalRequest({
      orgId: context.orgId,
      requestId,
      decidedByUserId: context.actorUserId,
      decision,
      justification,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.approval.decide',
      resource: 'approval_request',
      status: 'success',
      payload: {
        requestId,
        decision,
      },
    });
    auditLogged = true;

    return Response.json({ approval });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return toApiErrorResponse(new ApiError(404, 'NOT_FOUND', error.message));
    }
    if (error instanceof Error && error.message.includes('already')) {
      return toApiErrorResponse(new ApiError(409, 'CONFLICT', error.message));
    }

    if (context && requestId && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.approval.decide',
          resource: 'approval_request',
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'failed',
          payload: {
            requestId,
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
