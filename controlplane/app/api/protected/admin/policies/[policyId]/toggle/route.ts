import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAdminContext } from '@/lib/server/admin/context';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import { setPolicyEnabled, toPolicyBlockedTerms } from '@/lib/server/domain/policies';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ policyId: string }> },
) {
  let context;
  let policyId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    ({ policyId } = await params);

    let body: { enabled?: unknown } = {};
    try {
      body = (await request.json()) as { enabled?: unknown };
    } catch {
      body = {};
    }

    if (typeof body.enabled !== 'boolean') {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'enabled must be a boolean');
    }

    const policy = await setPolicyEnabled({
      orgId: context.orgId,
      policyId,
      enabled: body.enabled,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.policy.toggle',
      resource: 'policy_rule',
      status: 'success',
      payload: {
        policyId,
        enabled: body.enabled,
      },
    });
    auditLogged = true;

    return Response.json({
      policy: {
        id: policy.id,
        orgId: policy.orgId,
        name: policy.name,
        mode: policy.mode,
        enabled: policy.enabled,
        blockedTerms: toPolicyBlockedTerms(policy.definition),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return toApiErrorResponse(new ApiError(404, 'NOT_FOUND', error.message));
    }

    if (context && policyId && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.policy.toggle',
          resource: 'policy_rule',
          status: error instanceof ApiError && error.status === 403 ? 'denied' : 'failed',
          payload: {
            policyId,
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
