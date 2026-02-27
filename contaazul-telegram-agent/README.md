# Conta Azul Telegram Agent (Private MVP)

Agent-first backend for financeiro operations in Conta Azul via Telegram.

## Goal
Turn chat messages into safe, auditable financial actions:
- create receivable/payable
- list installments
- list people (customers/suppliers)
- statement of financial movements (extrato)
- acquit installment (mark paid/received)
- generate receipt PDF
- create client
- create financial account

## Architecture (high-level)
- **Telegram Gateway**: receives user messages
- **AI Orchestrator**: LLM + tool calling
- **Tool Runtime**: validated tool contracts (JSON schema)
- **Conta Azul Connector**: internal API adapter
- **Conta Azul Connect Extension**: no-HAR onboarding and secure session bridge
- **Jobs + Audit**: async execution + immutable event log

See `docs/architecture.md` and `docs/onboarding-extension.md`.

## MVP v1 scope
1. `finance.create_receivable`
2. `finance.create_payable`
3. `finance.list_installments`
4. `finance.acquit_installment`
5. `finance.get_receipt`
6. `crm.create_client`

## Security model
- write operations require explicit confirmation (`confirm=true`) or approval flow
- idempotency key required on write commands
- full audit trail per tool call

## Local scripts
- `scripts/contaazul_cli.py` for API validation/prototyping
- supports: client/account creation, receivable/payable create/list, acquit, receipt, and statement export (`--csv`)
- usage guide: `scripts/contaazul_cli.md`
- uses HAR auth (`x-authorization`) from logged browser session

