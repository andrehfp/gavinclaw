# Plan 001 — Generic Gateway (Web-first) for Multi-Channel Chat

## Status
Approved (inputs finalized, implementation pending)

## Owner
Cazu backend team

## Last updated
2026-02-28

---

## 1) Context and motivation

Today, our conversational execution core is solid (Oban workers, OpenAI action selection, tool execution, audit trail), but transport/channel concerns are mixed into the core flow.

Current channel coupling points include:
- Turn ingestion currently tied to Telegram-shaped fields (`chat_id`, `telegram_user_id`, `telegram_update_id`)
- Multiple direct outbound calls to `Cazu.Telegram.send_message/2` in workers/orchestrator
- Web chat (`/agent/chat`) and Telegram webhook are separate ingress paths with overlapping logic

This plan introduces a **generic gateway architecture** and makes **Web chat the primary channel now**. Telegram is **paused for now** and treated as a future adapter, together with channels like WhatsApp/Slack.

---

## 2) Goals

1. Build a channel-agnostic ingress contract for chat messages.
2. Make the LiveView web chat use the same gateway ingress pipeline.
3. Decouple outbound responses from Telegram-specific delivery.
4. Preserve existing orchestration/tool flow with minimal behavior changes.
5. Keep migration low-risk and incremental.
6. Support channel-specific outbound rendering (Web markdown now, channel-native rendering for future messengers).

---

## 3) Non-goals (for this iteration)

- Full Telegram decommission.
- WhatsApp/Slack implementation now.
- Full schema rename from legacy fields in one step.
- UI redesign.

---

## 4) High-level architecture

### 4.1 Canonical ingress model

Introduce canonical message shape used by all channels:

- `channel` — e.g. `"web"`, `"telegram"`, `"whatsapp"`, `"slack"`
- `thread_id` — channel conversation/thread identifier
- `external_user_id` — user identifier in source channel
- `external_message_id` — inbound message id for dedupe/idempotency
- `text` — normalized user message
- `received_at` — ingestion timestamp
- `raw_event` — original payload (optional/sanitized)
- `meta` — optional context extensions

Suggested module:
- `Cazu.Gateway.Message`

### 4.2 Adapter behavior

Define `Cazu.Gateway.Adapter` behavior with channel-specific responsibilities:

- `channel/0` -> atom/string channel id
- `verify_inbound/1` -> auth/signature verification
- `parse_inbound/1` -> `{:ok, %Gateway.Message{}} | {:error, reason}`
- `render_outbound/2` -> channel-specific rendering transform
- `send_outbound/2` -> transport send

Initial adapter:
- `Cazu.Gateway.Adapters.Web`

Future:
- `Cazu.Gateway.Adapters.Telegram`
- `Cazu.Gateway.Adapters.WhatsApp`
- `Cazu.Gateway.Adapters.Slack`

### 4.3 Ingress service

Create `Cazu.Gateway.Ingress`:
- Accept canonical message
- Resolve tenant + user
- Ensure conversation/session exists
- Enqueue `ConversationTurnWorker` with normalized job args
- Handle dedupe using `external_message_id`

### 4.4 Delivery service

Create `Cazu.Gateway.Delivery`:
- `send(channel, thread_id, payload, context)`
- Dispatches to channel adapter (web now, telegram later)
- Replaces direct `Telegram.send_message/2` calls in workers/orchestrator

For Web channel delivery:
- Broadcast assistant/runtime content via `AgentChatStream`
- Persist message metadata in `Conversations` as today
- No Telegram API dependency

### 4.5 Outbound rendering strategy (channel-native)

Introduce canonical outbound payload, then render per channel adapter:

Canonical payload (internal):
- `type` (`assistant_message`, `runtime_message`, `tool_status`, etc.)
- `text` (source content)
- `format_hint` (`markdown`, `plain`, `structured`)
- `meta` (tool_name, action, severity, timestamps)

Rendering rules:
- **Web**: render markdown in UI (current behavior should be preserved/improved).
- **Telegram**: use Telegram-specific formatting/capabilities when adapter is re-enabled.
- **WhatsApp/Slack/future**: each adapter maps canonical payload into platform-supported formatting.

This keeps business logic format-agnostic while preserving channel-native UX.

---

## 5) Incremental migration plan

## Phase A — Foundation (no behavior changes)

### Deliverables
- New modules:
  - `Cazu.Gateway.Message`
  - `Cazu.Gateway.Adapter` behavior
  - `Cazu.Gateway.Ingress`
  - `Cazu.Gateway.Delivery`
  - `Cazu.Gateway.Adapters.Web`
- Introduce Phoenix Auth as first-party identity/session foundation for web channel.
- Add tests for canonical validation + ingress enqueueing

### Acceptance criteria
- Existing tests still pass.
- No channel behavior regression.
- Phoenix Auth session is available for `/agent/chat` user context.
- New modules are unused or shadow-used initially (safe introduction).

---

## Phase B — Make LiveView Web chat use gateway ingress

### Deliverables
- Refactor `CazuWeb.AgentChatLive` `send_message` path:
  - Build canonical web message
  - Call `Gateway.Ingress.ingest/1`
  - Stop constructing worker args directly in LiveView
- Resolve tenant/user for Web channel from **authenticated user account** context
  - no tenant binding from ad-hoc `chat_id` session switching for the gateway path
- Introduce web thread UX for authenticated accounts (many threads):
  - create thread
  - list recent threads
  - switch active thread
- Keep same UI behavior (stream events, typing, queue/runtime messages)

### Acceptance criteria
- Sending message from `/agent/chat` still enqueues turn.
- Web gateway flow binds tenant/user from authenticated account only.
- Authenticated user can manage **multiple threads** (create/list/switch) in web chat.
- Existing LiveView tests are updated and passing.
- No Telegram token required for web-only local usage.

---

## Phase C — Outbound decoupling in workers

### Deliverables
- Replace direct `Telegram.send_message/2` usages in:
  - `ConversationTurnWorker`
  - `ToolExecutionWorker`
  - `Orchestrator` (where applicable)
- Use `Gateway.Delivery.send/4` with channel/thread context from job args/conversation

### Acceptance criteria
- Web flow end-to-end works without Telegram.
- No direct `Cazu.Telegram.send_message/2` usage remains in core workers/orchestrator path.
- Assistant and runtime updates still appear in LiveView.
- Outbound/inbound chat records are persisted into first-class `messages` storage (with metadata fallback still available during transition).

---

## Phase D — Data model hardening for multi-channel identity

### Deliverables
- Add fields to conversation/session identity model (incremental, backward compatible):
  - `channel`
  - `thread_id`
  - `external_user_id` (or related mapping table)
- Add thread-oriented persistence model for web-first multi-thread usage (per authenticated account).
- Introduce first-class `messages` table and write path for inbound/outbound messages.
  - include indexes for thread history retrieval `(channel, thread_id, inserted_at)`
  - include unique dedupe constraint on `(channel, thread_id, external_message_id)` when `external_message_id` is present
- Adopt `thread_id` as canonical naming; keep old `chat_id` compatibility during transition.
- Update tenancy/conversation lookups to support channel-thread identity.

### Acceptance criteria
- Existing data continues to work.
- New web sessions use canonical identity shape.
- Multiple threads per authenticated account are supported end-to-end.
- Message history UI is backed by first-class persisted messages.
- Query paths support both legacy and new fields during migration window.

---

## 6) Suggested module/API design (proposed)

### `Cazu.Gateway.Message`
- struct with validation helper (`new/1`)
- normalized strings + trimming
- safe defaults for optional metadata

### `Cazu.Gateway.Ingress`
- `ingest(%Gateway.Message{}) :: :ok | {:error, reason}`
- responsibilities:
  - tenant resolution from authenticated account context (web-first)
  - user upsert/binding
  - conversation/session upsert
  - Oban enqueue (`ConversationTurnWorker`)
  - strict dedupe guard by `(channel, thread_id, external_message_id)`

### `Cazu.Gateway.Delivery`
- `send(channel, thread_id, payload, context) :: :ok | {:error, reason}`
- adapter dispatch + fallback logging

### `Cazu.Gateway.Adapters.Web`
- inbound parser from LiveView/controller payload
- outbound uses `AgentChatStream` topic and payload conventions
- renders outbound markdown for web presentation

### `Cazu.Chat.Threads`
- thread CRUD/query API scoped to authenticated account + tenant
- resolves active thread per web session
- provides thread previews (last message/updated_at)

### `Cazu.Chat.Messages`
- canonical message persistence API (inbound/outbound/runtime)
- dedupe by `(channel, thread_id, external_message_id)` when present
- pagination for thread history
- transitional helper to feed LLM context cache in `conversation.metadata`

---

## 7) Worker job args migration strategy

Current args include Telegram-specific keys. Proposed transition:

1. Keep existing keys for compatibility.
2. Add canonical keys in parallel:
   - `channel`
   - `thread_id`
   - `external_user_id`
   - `external_message_id`
3. Workers read canonical first, fallback to legacy keys.
4. Remove legacy keys in a later cleanup plan.

---

## 8) Testing strategy

## Unit tests
- `Gateway.Message` validation/normalization
- `Gateway.Ingress` parsing + dedupe + enqueue args
- `Gateway.Delivery` adapter dispatch and failure handling

## Integration tests
- Web chat -> ingress -> Oban turn worker enqueue
- Turn worker + tool worker -> outbound web delivery -> first-class messages persistence
- Thread switching loads correct persisted message history

## LiveView tests
- Continue asserting element IDs (`#agent-chat-form`, `#agent-chat-messages`, etc.)
- Assert runtime events and assistant messages still appear
- Avoid raw HTML assertions (use `has_element?/2` etc.)

## Regression tests
- Ensure no dependency on Telegram configuration for web-only flow

---

## 9) Observability and audit

- Add trace events:
  - `gateway.ingress.received`
  - `gateway.ingress.enqueued`
  - `gateway.delivery.sent`
  - `gateway.delivery.error`
- Include `channel`, `thread_id`, `tenant_id` (sanitized)
- Keep secrets/tokens out of logs

---

## 10) Risks and mitigations

1. **Behavior drift during worker refactor**
   - Mitigation: phased rollout + regression tests before/after each phase

2. **Legacy field compatibility bugs**
   - Mitigation: dual-read strategy + explicit compatibility tests

3. **LiveView UX regressions (typing/runtime states)**
   - Mitigation: keep `AgentChatStream` event schema stable while moving internals

4. **Over-scoping migrations**
   - Mitigation: delay hard schema cleanup until web-first flow stabilizes

---

## 11) Rollout strategy

1. Ship Phase A behind no functional switch (internal only).
2. Enable Phase B for web chat (default path).
3. Roll Phase C with compatibility fallback if delivery fails.
4. Pause Telegram ingress/egress via config/feature flag for this rollout window.
5. Run `mix precommit` and validate green pipeline.
6. Proceed to Phase D once behavior is stable.

---

## 12) Backward compatibility policy

- Preserve existing routes and event payload shape where possible.
- Keep conversation metadata (`messages`, `last_*`) as transitional compatibility cache while first-class messages persistence becomes source of truth.
- Keep Telegram adapter code available, but keep Telegram ingress/egress paused during web-first rollout.

---

## 13) Decisions captured

1. Web channel tenant/user mapping: **authenticated user account**.
2. Naming direction: **`thread_id` as canonical** (with temporary `chat_id` compatibility).
3. Dedupe policy: **strict** by `(channel, thread_id, external_message_id)`.
4. Telegram during rollout: **paused for now**.
5. Formatting policy: **channel-specific rendering**.
   - Web should render markdown.
   - Telegram/WhatsApp/others should render using channel-native capabilities via each adapter.
6. Thread model for web: **many threads per authenticated account**.
7. Persistence strategy: **introduce first-class `messages` table now**; keep `conversation.metadata` as transitional context cache during migration.
8. Authentication direction: adopt **Phoenix Auth** as first-party account/session layer; keep Conta Azul OAuth as integration connector.
9. Tenant mapping now: **1 authenticated account = 1 tenant** for initial rollout, with schema/service design ready for future multi-tenant memberships (e.g. accountants with multiple accounts).
10. Web message id strategy: **deterministic client-generated `external_message_id`** for strict dedupe.
11. Phoenix Auth mode for v1: **standard email/password authentication**.

### Remaining clarification

None blocking for Phase A/B implementation.

---

## 14) Definition of done (for web-first gateway)

- Web chat ingress uses gateway pipeline end-to-end.
- Web gateway identity is bound to authenticated user account context.
- Core workers no longer call Telegram directly for web flow.
- Delivery + rendering abstractions are in place and tested.
- Web markdown rendering is preserved through adapter rendering path.
- Authenticated users can create/list/switch many web threads.
- First-class messages persistence is source of truth for thread history.
- Existing UX and tests remain stable.
- `mix precommit` passes.
- Documentation for adding new channels is included.
