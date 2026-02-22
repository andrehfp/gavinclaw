# InstaRelay — SPECS MVP

## Posicionamento
**Instagram Operations Reliability** para creators/agências pequenas.

## Arquitetura (MVP)
- FastAPI backend (multi-tenant via `workspace_id`)
- SQLite para jobs (MVP local)
- **Codex App Server** como planner/orquestrador de cada job
- **InstaCLI** como executor determinístico das ações Instagram
- Integração futura de secrets vault + Redis queue

## User Flows
### 1) Publish photo
1. Cliente envia request com `workspace_id`, `account_name`, `file_url`, `caption`
2. API cria `job` com status `pending`
3. Runner consulta Codex App Server para plano/checks
4. Runner executa comando InstaCLI
5. Job vira `succeeded` ou `failed` com logs

### 2) Comments inbox
1. Cliente pede inbox pendente (`days`, `limit`)
2. Runner chama `instacli comments inbox`
3. Retorna itens pendentes

### 3) Analytics summary
1. Cliente pede `--days 7|30`
2. Runner chama `instacli analytics summary`
3. Job entrega snapshot

## Endpoints
- `GET /health`
- `POST /jobs/publish/photo`
- `POST /jobs/publish/carousel`
- `POST /jobs/comments/inbox`
- `POST /jobs/comments/reply`
- `POST /jobs/analytics/summary`
- `GET /jobs/{job_id}`

## Data Model (MVP)
`jobs`
- `id` (uuid)
- `workspace_id`
- `account_name`
- `job_type`
- `status` (`pending|running|succeeded|failed`)
- `request_json`
- `result_json`
- `error`
- `created_at`
- `updated_at`

## Guardrails
- `account_name` obrigatório para jobs operacionais
- No MVP, human-in-the-loop para reply/publish sensível
- TODO: `confirm_account` obrigatório em produção

## TODOs pós-MVP
- Redis queue
- Postgres
- Secrets Vault/KMS
- Webhooks assinados
- Billing/metering
