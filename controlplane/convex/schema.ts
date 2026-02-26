import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Keep legacy role literals accepted so old rows don't block Convex startup.
// Authorization logic normalizes these to admin/user at runtime.
const roleValidator = v.union(
  v.literal('admin'),
  v.literal('user'),
  v.literal('owner'),
  v.literal('analyst'),
  v.literal('viewer'),
  v.literal('member'),
);

export default defineSchema({
  organizations: defineTable({
    externalId: v.string(),
    name: v.string(),
    isPersonal: v.boolean(),
  }).index('by_external_id', ['externalId']),

  users: defineTable({
    externalId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  }).index('by_external_id', ['externalId']),

  memberships: defineTable({
    orgId: v.id('organizations'),
    userId: v.id('users'),
    role: roleValidator,
    status: v.union(v.literal('active'), v.literal('invited'), v.literal('suspended')),
    source: v.union(v.literal('workos'), v.literal('local')),
    externalRole: v.optional(v.string()),
  })
    .index('by_org_user', ['orgId', 'userId'])
    .index('by_org', ['orgId'])
    .index('by_user', ['userId']),

  projects: defineTable({
    orgId: v.id('organizations'),
    createdByUserId: v.id('users'),
    name: v.string(),
    visibility: v.union(v.literal('shared'), v.literal('private')),
  })
    .index('by_org', ['orgId'])
    .index('by_org_visibility', ['orgId', 'visibility'])
    .index('by_org_creator_visibility', ['orgId', 'createdByUserId', 'visibility']),

  conversations: defineTable({
    orgId: v.id('organizations'),
    createdByUserId: v.id('users'),
    title: v.string(),
    status: v.union(v.literal('open'), v.literal('closed')),
    projectId: v.optional(v.id('projects')),
    forkedFromConversationId: v.optional(v.id('conversations')),
    pinnedAt: v.optional(v.number()),
  })
    .index('by_org', ['orgId'])
    .index('by_org_creator', ['orgId', 'createdByUserId'])
    .index('by_org_project', ['orgId', 'projectId']),

  messages: defineTable({
    orgId: v.id('organizations'),
    conversationId: v.id('conversations'),
    authorUserId: v.id('users'),
    clientMessageId: v.optional(v.string()),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.optional(v.string()),
    parts: v.optional(v.array(v.any())),
    attachments: v.optional(v.array(v.any())),
    redacted: v.boolean(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_org_conversation', ['orgId', 'conversationId'])
    .index('by_org_author', ['orgId', 'authorUserId'])
    .index('by_org_conversation_client_message', ['orgId', 'conversationId', 'clientMessageId']),

  artifacts: defineTable({
    orgId: v.id('organizations'),
    conversationId: v.id('conversations'),
    createdByUserId: v.id('users'),
    title: v.string(),
    kind: v.union(v.literal('text'), v.literal('code')),
    status: v.union(v.literal('active'), v.literal('archived')),
    latestVersion: v.number(),
    updatedAt: v.number(),
  })
    .index('by_conversation', ['conversationId'])
    .index('by_org_conversation', ['orgId', 'conversationId'])
    .index('by_org_creator', ['orgId', 'createdByUserId']),

  artifactVersions: defineTable({
    orgId: v.id('organizations'),
    conversationId: v.id('conversations'),
    artifactId: v.id('artifacts'),
    version: v.number(),
    content: v.string(),
    changeSummary: v.optional(v.string()),
    createdByUserId: v.id('users'),
  })
    .index('by_artifact_version', ['artifactId', 'version'])
    .index('by_conversation_artifact', ['conversationId', 'artifactId'])
    .index('by_org_conversation_artifact_version', ['orgId', 'conversationId', 'artifactId', 'version']),

  policyRules: defineTable({
    orgId: v.id('organizations'),
    name: v.string(),
    mode: v.union(v.literal('allow'), v.literal('warn'), v.literal('redact'), v.literal('block')),
    enabled: v.boolean(),
  }).index('by_org', ['orgId']),

  approvalRequests: defineTable({
    orgId: v.id('organizations'),
    requestedByUserId: v.id('users'),
    action: v.string(),
    resource: v.string(),
    justification: v.optional(v.string()),
    status: v.union(v.literal('pending'), v.literal('approved'), v.literal('rejected')),
    conversationId: v.optional(v.id('conversations')),
  })
    .index('by_org_status', ['orgId', 'status'])
    .index('by_org', ['orgId']),

  approvalDecisions: defineTable({
    orgId: v.id('organizations'),
    requestId: v.id('approvalRequests'),
    decidedByUserId: v.id('users'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    justification: v.optional(v.string()),
  }).index('by_request', ['requestId']),

  usageMetrics: defineTable({
    orgId: v.id('organizations'),
    metric: v.string(),
    periodStart: v.number(),
    periodEnd: v.number(),
    value: v.number(),
  }).index('by_org_metric_period', ['orgId', 'metric', 'periodStart']),

  queryUsages: defineTable({
    orgId: v.id('organizations'),
    conversationId: v.id('conversations'),
    actorUserId: v.id('users'),
    provider: v.string(),
    modelId: v.string(),
    providerModelId: v.string(),
    finishReason: v.optional(v.string()),
    stepCount: v.number(),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    totalTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    cacheReadTokens: v.optional(v.number()),
    cacheWriteTokens: v.optional(v.number()),
    providerCostUsd: v.optional(v.number()),
    providerCostSource: v.optional(v.string()),
    providerResponseId: v.optional(v.string()),
    usageRaw: v.optional(v.any()),
    providerMetadata: v.optional(v.any()),
  })
    .index('by_org', ['orgId'])
    .index('by_conversation', ['conversationId'])
    .index('by_org_conversation', ['orgId', 'conversationId']),

  auditEvents: defineTable({
    orgId: v.id('organizations'),
    actorUserId: v.id('users'),
    action: v.string(),
    resource: v.string(),
    status: v.union(v.literal('success'), v.literal('denied'), v.literal('failed')),
    payload: v.any(),
  })
    .index('by_org', ['orgId'])
    .index('by_org_actor', ['orgId', 'actorUserId']),
});
