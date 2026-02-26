import { getDbPool } from '@/lib/server/db/pool';

export type PolicyMode = 'allow' | 'warn' | 'redact' | 'block';

export type PolicyRule = {
  id: string;
  orgId: string;
  name: string;
  mode: PolicyMode;
  enabled: boolean;
  definition: Record<string, unknown>;
};

export type PolicyEvaluation = {
  decision: PolicyMode;
  matchedPolicyIds: string[];
  matchedPolicyNames: string[];
  redactedContent: string;
};

type PolicyRow = {
  id: string;
  org_external_id: string;
  name: string;
  mode: PolicyMode;
  enabled: boolean;
  definition_json: Record<string, unknown>;
};

const precedence: Record<PolicyMode, number> = {
  allow: 0,
  warn: 1,
  redact: 2,
  block: 3,
};

function extractBlockedTerms(definition: Record<string, unknown>): string[] {
  const blockedTerms = definition.blockedTerms;
  if (!Array.isArray(blockedTerms)) {
    return [];
  }

  return blockedTerms.filter((term): term is string => typeof term === 'string' && term.trim().length > 0);
}

function toPolicyRule(row: PolicyRow): PolicyRule {
  return {
    id: row.id,
    orgId: row.org_external_id,
    name: row.name,
    mode: row.mode,
    enabled: row.enabled,
    definition: row.definition_json ?? {},
  };
}

export function toPolicyBlockedTerms(definition: Record<string, unknown>): string[] {
  return extractBlockedTerms(definition);
}

function policyMatchesContent(policy: PolicyRule, content: string): { matched: boolean; matchedTerms: string[] } {
  const blockedTerms = extractBlockedTerms(policy.definition);
  if (blockedTerms.length === 0) {
    return { matched: false, matchedTerms: [] };
  }

  const contentLower = content.toLowerCase();
  const matchedTerms = blockedTerms.filter((term) => contentLower.includes(term.toLowerCase()));

  return {
    matched: matchedTerms.length > 0,
    matchedTerms,
  };
}

function redactContent(content: string, terms: string[]): string {
  if (terms.length === 0) {
    return content;
  }

  let redacted = content;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matcher = new RegExp(escaped, 'gi');
    redacted = redacted.replace(matcher, '[REDACTED]');
  }

  return redacted;
}

export async function listActivePolicies(orgId: string): Promise<PolicyRule[]> {
  const pool = getDbPool();
  const result = await pool.query<PolicyRow>(
    `
      SELECT
        p.id,
        o.external_id AS org_external_id,
        p.name,
        p.mode,
        p.enabled,
        p.definition_json
      FROM policy_rules p
      JOIN organizations o ON o.id = p.org_id
      WHERE o.external_id = $1
        AND p.enabled = TRUE
      ORDER BY p.created_at ASC
    `,
    [orgId],
  );

  return result.rows.map(toPolicyRule);
}

export async function listPolicies(input: { orgId: string; limit?: number }): Promise<PolicyRule[]> {
  const pool = getDbPool();
  const limit = Math.max(1, Math.min(input.limit ?? 200, 500));
  const result = await pool.query<PolicyRow>(
    `
      SELECT
        p.id,
        o.external_id AS org_external_id,
        p.name,
        p.mode,
        p.enabled,
        p.definition_json
      FROM policy_rules p
      JOIN organizations o ON o.id = p.org_id
      WHERE o.external_id = $1
      ORDER BY p.created_at DESC
      LIMIT $2
    `,
    [input.orgId, limit],
  );

  return result.rows.map(toPolicyRule);
}

export async function createPolicy(input: {
  orgId: string;
  actorUserId: string;
  name: string;
  mode: PolicyMode;
  enabled: boolean;
  blockedTerms: string[];
}): Promise<PolicyRule> {
  const pool = getDbPool();
  const result = await pool.query<PolicyRow>(
    `
      WITH org_ctx AS (
        SELECT id, external_id
        FROM organizations
        WHERE external_id = $1
      ),
      user_ctx AS (
        SELECT id
        FROM users
        WHERE external_id = $2
        LIMIT 1
      )
      INSERT INTO policy_rules (
        org_id,
        name,
        mode,
        enabled,
        definition_json,
        created_by_user_id
      )
      SELECT
        org_ctx.id,
        $3,
        $4::policy_mode,
        $5,
        $6::jsonb,
        user_ctx.id
      FROM org_ctx
      LEFT JOIN user_ctx ON TRUE
      RETURNING
        policy_rules.id,
        (SELECT external_id FROM organizations WHERE id = policy_rules.org_id) AS org_external_id,
        policy_rules.name,
        policy_rules.mode,
        policy_rules.enabled,
        policy_rules.definition_json
    `,
    [
      input.orgId,
      input.actorUserId,
      input.name,
      input.mode,
      input.enabled,
      JSON.stringify({ blockedTerms: input.blockedTerms }),
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Could not create policy rule in this organization');
  }

  return toPolicyRule(row);
}

export async function updatePolicy(input: {
  orgId: string;
  policyId: string;
  patch: Partial<{
    name: string;
    mode: PolicyMode;
    enabled: boolean;
    blockedTerms: string[];
  }>;
}): Promise<PolicyRule> {
  const existing = await getPolicyById(input.orgId, input.policyId);
  if (!existing) {
    throw new Error('Policy rule not found in this organization');
  }

  const nextName = input.patch.name ?? existing.name;
  const nextMode = input.patch.mode ?? existing.mode;
  const nextEnabled = input.patch.enabled ?? existing.enabled;
  const nextBlockedTerms = input.patch.blockedTerms ?? extractBlockedTerms(existing.definition);

  const pool = getDbPool();
  const result = await pool.query<PolicyRow>(
    `
      UPDATE policy_rules p
      SET
        name = $3,
        mode = $4::policy_mode,
        enabled = $5,
        definition_json = $6::jsonb,
        updated_at = NOW()
      FROM organizations o
      WHERE p.id = $2
        AND p.org_id = o.id
        AND o.external_id = $1
      RETURNING
        p.id,
        o.external_id AS org_external_id,
        p.name,
        p.mode,
        p.enabled,
        p.definition_json
    `,
    [
      input.orgId,
      input.policyId,
      nextName,
      nextMode,
      nextEnabled,
      JSON.stringify({ blockedTerms: nextBlockedTerms }),
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('Could not update policy rule in this organization');
  }

  return toPolicyRule(row);
}

export async function setPolicyEnabled(input: {
  orgId: string;
  policyId: string;
  enabled: boolean;
}): Promise<PolicyRule> {
  return updatePolicy({
    orgId: input.orgId,
    policyId: input.policyId,
    patch: {
      enabled: input.enabled,
    },
  });
}

export async function deletePolicy(input: { orgId: string; policyId: string }): Promise<boolean> {
  const pool = getDbPool();
  const result = await pool.query<{ id: string }>(
    `
      DELETE FROM policy_rules p
      USING organizations o
      WHERE p.id = $2
        AND p.org_id = o.id
        AND o.external_id = $1
      RETURNING p.id
    `,
    [input.orgId, input.policyId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function getPolicyById(orgId: string, policyId: string): Promise<PolicyRule | null> {
  const pool = getDbPool();
  const result = await pool.query<PolicyRow>(
    `
      SELECT
        p.id,
        o.external_id AS org_external_id,
        p.name,
        p.mode,
        p.enabled,
        p.definition_json
      FROM policy_rules p
      JOIN organizations o ON o.id = p.org_id
      WHERE o.external_id = $1
        AND p.id = $2
      LIMIT 1
    `,
    [orgId, policyId],
  );

  const row = result.rows[0];
  return row ? toPolicyRule(row) : null;
}

export function evaluatePolicies(input: { content: string; policies: PolicyRule[] }): PolicyEvaluation {
  let decision: PolicyMode = 'allow';
  const matchedPolicyIds: string[] = [];
  const matchedPolicyNames: string[] = [];
  const matchedTermsForRedaction = new Set<string>();

  for (const policy of input.policies) {
    const match = policyMatchesContent(policy, input.content);
    if (!match.matched) {
      continue;
    }

    matchedPolicyIds.push(policy.id);
    matchedPolicyNames.push(policy.name);

    for (const term of match.matchedTerms) {
      matchedTermsForRedaction.add(term);
    }

    if (precedence[policy.mode] > precedence[decision]) {
      decision = policy.mode;
    }
  }

  const redactedContent = decision === 'redact' || decision === 'block'
    ? redactContent(input.content, Array.from(matchedTermsForRedaction))
    : input.content;

  return {
    decision,
    matchedPolicyIds,
    matchedPolicyNames,
    redactedContent,
  };
}
