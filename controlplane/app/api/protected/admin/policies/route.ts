import { mirrorAuditEvent, queueMirrorAuditEvent } from '@/lib/server/audit/mirror';
import { requireAdminContext } from '@/lib/server/admin/context';
import type { AdminPolicyRule } from '@/lib/server/admin/types';
import { ApiError, toApiErrorResponse } from '@/lib/server/authz';
import {
  createPolicy,
  listPolicies,
  toPolicyBlockedTerms,
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
    return [];
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

export async function GET() {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();
    const policies = await listPolicies({ orgId: context.orgId, limit: 300 });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.policy.list',
      resource: 'policy_rule',
      status: 'success',
      payload: {
        count: policies.length,
      },
    });
    auditLogged = true;

    return Response.json({ policies: policies.map(toAdminPolicy) });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.policy.list',
          resource: 'policy_rule',
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

export async function POST(request: Request) {
  let context;
  let auditLogged = false;

  try {
    context = await requireAdminContext();

    let body: { name?: unknown; mode?: unknown; enabled?: unknown; blockedTerms?: unknown } = {};
    try {
      body = (await request.json()) as { name?: unknown; mode?: unknown; enabled?: unknown; blockedTerms?: unknown };
    } catch {
      body = {};
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      throw new ApiError(400, 'INVALID_ARGUMENT', 'name is required');
    }

    const mode = parsePolicyMode(body.mode);
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const blockedTerms = parseBlockedTerms(body.blockedTerms);

    const created = await createPolicy({
      orgId: context.orgId,
      actorUserId: context.actorUserId,
      name,
      mode,
      enabled,
      blockedTerms,
    });

    queueMirrorAuditEvent({
      accessToken: context.accessToken,
      orgId: context.orgId,
      actorId: context.actorUserId,
      action: 'admin.policy.create',
      resource: 'policy_rule',
      status: 'success',
      payload: {
        policyId: created.id,
        mode: created.mode,
        enabled: created.enabled,
      },
    });
    auditLogged = true;

    return Response.json({ policy: toAdminPolicy(created) }, { status: 201 });
  } catch (error) {
    if (context && !auditLogged) {
      try {
        await mirrorAuditEvent({
          accessToken: context.accessToken,
          orgId: context.orgId,
          actorId: context.actorUserId,
          action: 'admin.policy.create',
          resource: 'policy_rule',
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
