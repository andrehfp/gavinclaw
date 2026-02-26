import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAdminContext } from '@/lib/server/admin/context';
import type { AdminPolicyRule } from '@/lib/server/admin/types';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import {
  deletePolicy,
  toPolicyBlockedTerms,
  updatePolicy,
  type PolicyMode,
} from '@/lib/server/domain/policies';

function parsePolicyMode(value: unknown): PolicyMode {
  if (value === 'allow' || value === 'warn' || value === 'redact' || value === 'block') {
    return value;
  }

  throw new ApiError(400, 'INVALID_ARGUMENT', 'mode must be one of: allow, warn, redact, block');
}

function parseBlockedTerms(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_ARGUMENT', 'blockedTerms must be an array of strings');
  }

  return value
    .map((term) => (typeof term === 'string' ? term.trim() : ''))
    .filter((term) => term.length > 0);
}

function toAdminPolicy(policy: {
  id: string;
  orgId: string;
  name: string;
  mode: PolicyMode;
  enabled: boolean;
  definition: Record<string, unknown>;
}): AdminPolicyRule {
  return {
    id: policy.id,
    orgId: policy.orgId,
    name: policy.name,
    mode: policy.mode,
    enabled: policy.enabled,
    blockedTerms: toPolicyBlockedTerms(policy.definition),
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ policyId: string }> },
) {
  let context;
  let policyId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    ({ policyId } = await params);

    let body: {
      name?: unknown;
      mode?: unknown;
      enabled?: unknown;
      blockedTerms?: unknown;
    } = {};
    try {
      body = (await request.json()) as {
        name?: unknown;
        mode?: unknown;
        enabled?: unknown;
        blockedTerms?: unknown;
      };
    } catch {
      body = {};
    }

    const patch: Partial<{
      name: string;
      mode: PolicyMode;
      enabled: boolean;
      blockedTerms: string[];
    }> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || body.name.trim().length === 0) {
        throw new ApiError(400, 'INVALID_ARGUMENT', 'name must be a non-empty string');
      }
      patch.name = body.name.trim();
    }

    if (body.mode !== undefined) {
      patch.mode = parsePolicyMode(body.mode);
    }

    if (body.enabled !== undefined) {
      if (typeof body.enabled !== 'boolean') {
        throw new ApiError(400, 'INVALID_ARGUMENT', 'enabled must be a boolean');
      }
      patch.enabled = body.enabled;
    }

    if (body.blockedTerms !== undefined) {
      patch.blockedTerms = parseBlockedTerms(body.blockedTerms);
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'At least one patch field is required');
    }

    const updated = await updatePolicy({
      orgId: context.orgId,
      policyId,
      patch,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.policy.update',
      resource: 'policy_rule',
      status: 'success',
      payload: {
        policyId,
        patchFields: Object.keys(patch),
      },
    });
    auditLogged = true;

    return Response.json({ policy: toAdminPolicy(updated) });
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
          action: 'admin.policy.update',
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ policyId: string }> },
) {
  let context;
  let policyId: string | null = null;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    ({ policyId } = await params);

    const deleted = await deletePolicy({
      orgId: context.orgId,
      policyId,
    });

    if (!deleted) {
      throw new ApiError(404, 'NOT_FOUND', 'Policy rule not found in this organization');
    }

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.policy.delete',
      resource: 'policy_rule',
      status: 'success',
      payload: {
        policyId,
      },
    });
    auditLogged = true;

    return Response.json({ ok: true });
  } catch (error) {
    if (context && policyId && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.policy.delete',
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
