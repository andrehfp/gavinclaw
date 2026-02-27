# Conta Azul AI Agent - MVP Idea

## One-liner
AI financial copilot for Conta Azul, connected by one-click Chrome extension, operated via Telegram chat, with audited and approval-gated actions.

## Product vision
Build a simple, safe, and extensible AI Agent that helps SMBs and accounting teams operate Conta Azul faster through chat.

## Core principles
1. **No HAR for end users**
   - HAR is internal fallback for debug only.
   - Official onboarding uses Chrome extension.

2. **User logs in, extension connects**
   - User logs in to Conta Azul normally.
   - Extension validates active session and sends secure connection payload to backend.
   - Extension does not ask for Conta Azul password.

3. **Chat-first UX**
   - Main interface is Telegram.
   - Optional dashboard chat and extension quick actions can come later.

4. **Safety first**
   - Write actions require confirmation/approval.
   - Idempotency key required for write tools.
   - Full audit trail for every action.

5. **Multi-tenant by design**
   - One Telegram bot for all customers.
   - Strict isolation by tenant/workspace and user.

## MVP scope (v1)
### Finance tools
- Create accounts receivable
- Create accounts payable
- List installments (receivable/payable)
- Acquit installment (mark as paid/received)
- Generate receipt PDF
- Get financial statement (extrato)

### CRM tools
- Create client
- List people (customers/suppliers)

## Tech stack
- **Backend:** Elixir + Phoenix
- **Queue/Jobs:** Oban + Postgres
- **LLM orchestration:** backend-controlled tool calling (OpenAI first, pluggable providers)
- **Chat channel:** Telegram Bot API
- **Onboarding:** Chrome extension (Conta Azul Connect)

## Runtime architecture
1. Telegram webhook receives message
2. Orchestrator parses intent and chooses tool(s)
3. Policy layer enforces risk rules and confirmation gates
4. Job executes connector action against Conta Azul
5. Result is logged to immutable audit events
6. User receives response in Telegram

## Guardrails (mandatory)
- `confirm=true` for write actions
- idempotency on all write commands
- retries with backoff + timeouts per tool
- sanitized logs (no sensitive leakage)
- tenant and user-level authorization

## Onboarding flow (MVP)
1. User signs up for trial
2. Installs Chrome extension
3. Opens Conta Azul and logs in
4. Clicks **Connect** in extension
5. Backend validates read-only call and returns `CONNECTED`
6. User can start using the Telegram agent

## What comes next (post-MVP)
- Daily Telegram summaries (cashflow, due today, overdue)
- Collections playbook for overdue receivables
- Assisted reconciliation suggestions
- Dashboard for audit + approvals + operations
