# Versão Técnica — ControlPlane AI v1

## 1. Objetivo técnico
Entregar um gateway de governança para IA corporativa com:
- autenticação corporativa
- aplicação de políticas pré/pós inferência
- trilha de auditoria imutável
- aprovação humana para ações críticas
- observabilidade de custo/latência/qualidade operacional

## 2. Arquitetura v1 (componentes)

### 2.1 Client Layer
- Web chat (Next.js + Vercel AI SDK)
- Endpoint API para integrações internas

### 2.2 Identity Layer
- OIDC/SAML (Azure AD/Okta/Google Workspace)
- RBAC por tenant/projeto/papel

### 2.3 AI Gateway (core)
- Endpoint unificado `/v1/chat/completions` compatível
- roteador de provider/modelo
- quotas e budget por tenant/team
- fallback entre providers

### 2.4 Policy Engine
- pré-inferência:
  - regex/rules para PII e dados sensíveis
  - mascaramento ou bloqueio
- pós-inferência:
  - redaction de saída
  - filtro de conteúdo proibido

### 2.5 Agent Runtime (ações)
- catálogo de tools permitidas por papel
- execution sandbox
- fila HITL para ações críticas

### 2.6 Governance Plane
- observability (OpenTelemetry)
- audit log append-only
- dashboard (uso, custo, bloqueios, incidentes)

## 3. Stack sugerida v1
- **Frontend:** Next.js + Vercel AI SDK
- **API Gateway/Backend:** FastAPI (Python)
- **Queue:** Redis + RQ/Celery
- **DB transacional:** Postgres
- **Audit/Event store:** Postgres append-only (v1) -> ClickHouse (v2)
- **Auth:** Authlib + OIDC/SAML
- **Tracing:** OpenTelemetry + Grafana Tempo/Prometheus
- **Secrets:** Vault/KMS

## 4. Modelo de dados mínimo

### `tenants`
- id, name, status, plan

### `users`
- id, tenant_id, email, role, sso_subject

### `projects`
- id, tenant_id, name, budget_limit

### `policies`
- id, tenant_id, scope, type, mode(block|mask|warn), rule_json, version

### `requests`
- id, tenant_id, project_id, user_id, provider, model, prompt_hash, token_in, token_out, cost, latency_ms, status

### `policy_events`
- id, request_id, policy_id, action, details_json

### `agent_actions`
- id, request_id, tool_name, risk_level, status(pending|approved|rejected|executed), reviewer_id, reason

### `audit_log`
- id, tenant_id, event_type, payload_json, created_at, checksum, prev_checksum

## 5. APIs v1

### 5.1 Inference
- `POST /v1/chat/completions`
- payload estilo OpenAI-compatible
- headers: tenant/project/user context

### 5.2 Policies
- `GET /v1/policies`
- `POST /v1/policies`
- `PUT /v1/policies/{id}`
- `POST /v1/policies/{id}/publish`

### 5.3 HITL
- `GET /v1/approvals/pending`
- `POST /v1/approvals/{id}/approve`
- `POST /v1/approvals/{id}/reject`

### 5.4 Governance
- `GET /v1/metrics/usage`
- `GET /v1/metrics/cost`
- `GET /v1/audit/export?from=&to=`

## 6. Fluxos críticos

### 6.1 Chat request
1. usuário autenticado chama endpoint
2. gateway valida RBAC + quota
3. policy engine pré-processa (mask/block)
4. roteador escolhe provider/modelo
5. recebe resposta
6. policy pós-processa
7. registra request + audit + métricas
8. devolve resposta

### 6.2 Ação crítica de agente
1. agente propõe ação (ex: criar pedido, alterar cadastro)
2. classificador de risco marca como `critical`
3. cria item em `approvals/pending`
4. aprovador humano decide
5. executa ou cancela
6. grava trilha completa em audit

## 7. Regras iniciais de policy (v1)
- Bloquear CPF completo sem mascaramento
- Bloquear número de cartão e CVV
- Mascara e-mail/telefone em contexto externo
- Bloquear instruções de exfiltração de base interna
- Bloquear tool externa para usuários sem permissão

## 8. Segurança e compliance v1
- TLS obrigatório
- criptografia at-rest no banco
- isolamento lógico por tenant
- assinaturas/checksum encadeado no audit_log
- retenção configurável (90/180/365)

## 9. SLOs técnicos
- p95 latência adicional do gateway: <300ms
- disponibilidade mensal: 99.5%
- taxa de erro 5xx: <0.5%
- perda de eventos de auditoria: 0

## 10. Plano de entrega (8 semanas)

### Semana 1-2
- base backend + auth + multi-tenant
- endpoint inference compatível
- logging inicial

### Semana 3-4
- policy engine v1 (pre/post)
- quotas/budget
- painel básico de uso/custo

### Semana 5-6
- HITL completo
- auditoria append-only com checksum chain
- export de auditoria

### Semana 7-8
- hardening, testes de carga
- integração com 1 caso real do piloto
- ajustes de UX + rollout controlado

## 11. Testes obrigatórios
- unit: policy match/mask/block
- integration: fluxo completo inference
- security: bypass de política e tentativa de exfiltração
- load: p95 com concorrência prevista
- resilience: fallback provider e retry idempotente

## 12. Backlog v2 (depois do piloto)
- conectores RAG enterprise (SharePoint, Confluence, Drive)
- ABAC avançado por atributo de documento
- policy simulator (dry-run)
- BYOC/self-hosted enterprise
- detecção de anomalia comportamental

## 13. Critério técnico de aceite do MVP
- 100% das requests passam por policy engine
- trilha de auditoria exportável e verificável
- HITL funcional para ações críticas
- dashboard com custo/uso por tenant e projeto
- p95 dentro do SLO em ambiente de piloto
