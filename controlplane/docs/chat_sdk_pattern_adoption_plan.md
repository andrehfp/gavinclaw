# Chat SDK Pattern Adoption Plan (WorkOS + Convex)

_Prepared on February 25, 2026_

## Goal

Upgrade the current chat stack to modern AI SDK/Chat SDK patterns without replacing your WorkOS + Convex architecture.

Keep:
- WorkOS auth and org/role claims
- Convex as realtime chat persistence
- Postgres governance/audit controls

Adopt:
- AI SDK streaming chat transport
- tool calling and tool approval flows
- message parts (instead of flat `content`)
- production guardrails (rate limits, error taxonomy)

## Current Baseline (Repo)

- Chat persistence and APIs are string-only messages (`content`), no message parts, no AI stream, no tool calls.
- Key files:
  - `app/conversations/[conversationId]/ConversationClient.tsx`
  - `app/api/protected/conversations/[conversationId]/messages/route.ts`
  - `convex/messages.ts`
  - `convex/schema.ts`

## Patterns To Copy From Chat SDK

## 1) `useChat` + `DefaultChatTransport` (copy now)

Why:
- standard streaming lifecycle (`submitted`, `streaming`, `ready`)
- built-in helpers (`stop`, `regenerate`, `resumeStream`)
- predictable request shaping via `prepareSendMessagesRequest`

Reference pattern:
- client chat transport sends only last user message in normal flow
- sends full message history only for approval continuations

## 2) Server `createUIMessageStreamResponse` + `streamText` (copy now)

Why:
- clean server streaming contract
- supports tool calling and multipart UI messages
- supports final persistence on `onFinish`

Reference pattern:
- persist user message immediately
- stream assistant parts live
- persist assistant output on finish

## 3) Message Parts Schema (copy now)

Why:
- required for tools, reasoning blocks, file parts, and advanced rendering
- aligns with current AI SDK UI protocols

Reference pattern:
- move from `content` string to `parts` JSON array (+ optional metadata)
- keep compatibility fallback temporarily

## 4) Tool Approval Flow (`needsApproval`, `addToolApprovalResponse`) (copy in phase 2/3)

Why:
- critical for safety when tools can mutate data or trigger side effects
- explicit user consent loop

Reference pattern:
- tool states: `approval-requested`, `approval-responded`, `output-available`, `output-denied`
- auto-continue only after approved response

## 5) Side-channel data stream events (copy in phase 3+)

Why:
- update UI state not represented as chat text (example: chat title updates)
- useful for your control-plane context panels and summaries

Reference pattern:
- `onData` handler + lightweight stream context/provider

## 6) Attachments upload + file parts (copy in phase 4)

Why:
- enables image/PDF assisted prompts
- pairs naturally with message parts

Reference pattern:
- upload endpoint with strict validation
- `file` parts attached to user message

## 7) Rate limits + typed error codes (copy now)

Why:
- prevents abuse and runaway costs
- stabilizes UI handling for known error classes

Reference pattern:
- per-user/per-org message quota window before model call
- normalized error types surfaced to client

## Patterns To Skip For Now

- Full artifact subsystem (document canvas, suggestion tools): high complexity, low immediate value.
- Chat voting system: not core to control-plane workflows.
- Guest-auth patterns from template: not needed with WorkOS.

## Implementation Plan (Phased)

## Phase 0: Architecture decisions (0.5 day)

1. Make `app/conversations/[conversationId]/ConversationClient.tsx` the canonical chat UI.
2. Keep existing REST endpoints for list/create conversations.
3. Add a new AI streaming endpoint under protected routes.
4. Choose first provider path:
   - direct provider key (`@ai-sdk/openai` / `@ai-sdk/anthropic`), or
   - AI Gateway.

Deliverable:
- short ADR in `docs/` with chosen provider and limits.

## Phase 1: Data model migration to parts (1 day)

Scope:
- `convex/schema.ts`
- `convex/messages.ts`
- `app/api/protected/conversations/[conversationId]/messages/route.ts`
- UI message typing in chat client(s)

Steps:
1. Extend message record with `parts` (JSON-like array) and optional `attachments`.
2. Keep `content` temporarily for backward compatibility.
3. Update list/create message functions to return normalized `{ id, role, parts, createdAt, redacted }`.
4. Add a server normalizer:
   - if `parts` missing, map legacy `content` -> `[ { type: "text", text: content } ]`.

Acceptance:
- Existing conversations still render.
- New messages are persisted with `parts`.

## Phase 2: Streaming endpoint + AI model integration (1.5 days)

Scope:
- new: `app/api/protected/conversations/[conversationId]/stream/route.ts`
- new: `lib/ai/providers.ts`
- new: `lib/ai/prompts.ts`
- new: `lib/ai/errors.ts` (or extend existing server errors)

Steps:
1. Add protected streaming POST route with:
   - `requireAuthenticatedContext`
   - `requireRole(WRITE_ROLES)`
   - request zod schema (id, message/messages, selected model)
2. Persist user message at request start.
3. Load conversation history from Convex and convert to model messages.
4. Stream assistant output with `streamText` and return `createUIMessageStreamResponse`.
5. Persist assistant messages/parts in `onFinish`.
6. Add consistent AI error mapping (rate limit, auth, provider unavailable, validation).

Acceptance:
- Assistant response streams token-by-token in UI.
- Final assistant message persists and appears on refresh.

## Phase 3: Client migration to `useChat` transport (1 day)

Scope:
- `app/conversations/[conversationId]/ConversationClient.tsx`
- optional shared chat hook (new file)

Steps:
1. Replace manual send/fetch logic with `useChat`.
2. Configure `DefaultChatTransport` to call new stream endpoint.
3. Implement `prepareSendMessagesRequest`:
   - normal flow sends last user message
   - approval continuation sends whole message list
4. Wire `status`, `stop`, `regenerate`, and optimistic UX.
5. Keep sidebar list refresh behavior after completion.

Acceptance:
- smooth streaming UX
- stop/regenerate work
- no regression in auth/role behavior

## Phase 4: Tool calling + approval for sensitive tools (1.5 days)

Scope:
- new: `lib/ai/tools/*`
- streaming route tool config
- message rendering components for tool parts/states

Initial tool set (control-plane specific):
1. `getPolicySummary` (read-only)
2. `getRecentAuditEvents` (read-only)
3. `createApprovalDraft` (mutating, requires approval)

Steps:
1. Define tool schemas with Zod.
2. Mark mutating tools with `needsApproval: true`.
3. Render approval UI in assistant message parts.
4. Handle `addToolApprovalResponse` in client and auto-continue when approved.

Acceptance:
- read-only tools execute automatically
- mutating tool pauses for user approval and resumes correctly

## Phase 5: Optional enhancements (1-2 days)

1. Add attachments upload route and `file` parts.
2. Add side-channel stream data for:
   - auto title suggestions
   - control-panel updates
3. Add resumable streams (only if needed for long responses/network interruptions).

## Phase 6: Guardrails and test coverage (1 day)

Scope:
- API tests for auth/RBAC and input validation
- integration tests for stream lifecycle
- tool approval tests

Required test cases:
1. `user` can invoke streaming write endpoint.
2. user message persisted before AI completion.
3. assistant `parts` persisted on finish.
4. approval-required tool blocks until user decision.
5. denial path yields `output-denied` state.
6. rate limit returns expected error code.

## Rollout and Risk Control

1. Ship behind feature flag (`AI_CHAT_V2_ENABLED`) at org-level.
2. Start with internal orgs only.
3. Keep legacy non-stream path available during migration.
4. Monitor:
   - stream failure rate
   - tool approval completion rate
   - average latency/cost per message

Rollback:
- disable feature flag and route traffic back to legacy message endpoint.

## Dependency Additions (expected)

- `ai`
- `@ai-sdk/react`
- provider package(s), e.g. `@ai-sdk/openai` or `@ai-sdk/anthropic`
- optional: gateway/provider telemetry helpers

## Execution Order (Recommended)

1. Phase 1 (parts migration)
2. Phase 2 (server streaming)
3. Phase 3 (client `useChat`)
4. Phase 4 (tools + approval)
5. Phase 6 (tests + guardrails)
6. Phase 5 (optional enhancements)
