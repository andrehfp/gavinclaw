# Architecture

## 1) Telegram Gateway
- Receives webhook update
- Normalizes into `conversation_id`, `tenant_id`, `user_id`, `text`
- Sends to Orchestrator

## 2) Orchestrator (Elixir)
- Prompt + policies + available tools
- Executes tool-calling loop
- Produces user-facing response and operation summary

## 3) Tool Runtime
- Tool registry
- JSON schema validation (input/output)
- Idempotency + retries
- Emits events (`tool.started`, `tool.succeeded`, `tool.failed`)

## 4) Conta Azul Connector
- Single adapter module for all Conta Azul operations
- Manages auth context (session bridge via extension as default)
- HAR remains debug fallback only (internal)
- Converts internal domain payloads -> Conta Azul payloads

## 5) Conta Azul Connect Extension
- Chrome extension for frictionless onboarding
- Captures authenticated browser context safely
- Sends encrypted connection payload to backend
- Runs read-only validation call and returns `connected` status

## 6) Jobs and Audit
- Oban queue (Postgres)
- `jobs`, `job_events`, `tool_calls` tables
- Immutable audit entries with sanitized payloads

## 7) Approval Guardrails
- Commands classified by risk
- High-risk writes require approval event before execution

## Sequence (write)
1. User asks action in Telegram
2. LLM plans and proposes tool call
3. Guard checks policy/confirmation
4. Job enqueued and executed
5. Connector calls Conta Azul
6. Audit persisted
7. Final message sent to user
