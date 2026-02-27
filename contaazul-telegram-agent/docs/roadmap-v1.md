# Roadmap v1 (7-10 days)

## Phase 1 - Core (Days 1-3)
- Phoenix app + Postgres + Oban
- Telegram webhook endpoint
- Tool registry + schema validation
- Basic orchestration loop

## Phase 2 - Finance tools (Days 4-6)
- create receivable/payable
- list installments
- statement (extrato de movimentações)
- acquit installment
- get receipt
- create client

## Phase 3 - Onboarding UX (Days 7-8)
- Chrome extension `Conta Azul Connect` (MVP)
- One-click connect flow (no HAR for end users)
- backend endpoints `/v1/connect/conta-azul` + `/validate`
- read-only validation and tenant bootstrap

## Phase 4 - Safety + Ops (Days 9-10)
- approval flow for write actions
- idempotency + retry policy
- audit timeline endpoint
- error taxonomy + user-safe messaging
