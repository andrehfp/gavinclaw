# Plano de Migração: Postgres como Source of Truth + Convex como Projeção Realtime

## Objetivo

Adotar uma arquitetura **Postgres-first** para domínio crítico/compliance e usar o **Convex apenas como camada realtime de projeção/UI**, com **Vercel AI SDK** como gateway de LLM.

## Princípios

1. **Verdade única de compliance no Postgres**
   - tenancy/orgs
   - usuários + RBAC
   - policies
   - approvals (HITL)
   - audit log append-only

2. **Convex como read-model realtime**
   - chat em tempo real
   - presença
   - cache/estado de UI

3. **Sem dual-write ingênuo**
   - gravação transacional no Postgres
   - sincronização para Convex via eventos/outbox assíncrono

4. **Vercel AI SDK como gateway único de LLM**
   - API do app não chama provider diretamente
   - políticas/approvals avaliadas antes da chamada ao modelo

---

## Estado Atual (resumo)

Hoje o projeto já possui dados de domínio também no Convex (org, user, membership, policies, approvals, audit espelhado), além do audit em Postgres.

## Estado Alvo

- Postgres é autoridade para RBAC/policies/approvals/audit.
- Convex mantém projeções para realtime.
- API routes validam contexto no Postgres.
- Chat passa por policy/HITL antes do LLM.

---

## Plano por Fases (PRs incrementais)

## Fase 0 — Fundamentos e contrato arquitetural

### Entregáveis
- Documento ADR com fronteiras de dados.
- Definição de IDs canônicos (UUID no Postgres; externalId no Convex).
- Convenções de evento de domínio (nome, payload, versão).

### Critério de aceite
- Time alinhado sobre quem é autoridade por entidade.

---

## Fase 1 — Schema Postgres de domínio (sem cutover)

### Entregáveis
- Novas migrations Postgres para:
  - `organizations`
  - `users`
  - `memberships`
  - `policy_rules`
  - `approval_requests`
  - `approval_decisions`
  - (manter `audit_events` append-only)
- Índices por `org_id`, `user_id`, status e consultas de aprovação.
- Constraints para integridade + unicidade (`org+user` em memberships).

### Critério de aceite
- Migration idempotente aplicada com sucesso em ambiente local.

---

## Fase 2 — Camada de domínio no servidor (Postgres)

### Entregáveis
- `lib/server/db/*` (pool, tx helper).
- `lib/server/domain/session.ts`
  - provisionamento/lookup de usuário/org/membership no Postgres com base no WorkOS.
- `lib/server/domain/rbac.ts`
- `lib/server/domain/policies.ts`
- `lib/server/domain/approvals.ts`
- `lib/server/domain/audit.ts` (append-only, assinatura/hash já existente).

### Critério de aceite
- `requireAuthenticatedContext` passa a depender do Postgres para role/org.

---

## Fase 3 — Outbox + sincronização para Convex (projeção)

### Entregáveis
- Tabela `domain_outbox` no Postgres.
- Escrita transacional: mudança de domínio + evento outbox no mesmo commit.
- Worker/sync job para publicar eventos no Convex.
- Tolerância a falha com retry e idempotência.

### Critério de aceite
- Nenhuma operação crítica depende de dual-write direto Postgres+Convex.

---

## Fase 4 — Chat pipeline com Vercel AI SDK + HITL

### Entregáveis
- Endpoint de chat (`app/api/protected/chat/route.ts`) usando Vercel AI SDK (`streamText`/`useChat`).
- Fluxo:
  1. autentica e resolve contexto no Postgres
  2. avalia policies
  3. cria approval se necessário
  4. chama LLM quando permitido
  5. grava audit + eventos de domínio no Postgres
  6. projeta estado no Convex
- Persistência de mensagens no Convex como read-model realtime.

### Critério de aceite
- Mensagens bloqueadas por policy não chegam ao LLM.
- Aprovação pendente impede execução até decisão.

---

## Fase 5 — Cutover e limpeza de domínio no Convex

### Entregáveis
- Rotas e funções antigas que tratam RBAC/policies/approvals no Convex removidas.
- Convex fica apenas com:
  - chat/presença/UI state
  - projeções de leitura
- Backfill final de projeções.

### Critério de aceite
- Source of truth de compliance totalmente no Postgres.

---

## Fase 6 — Observabilidade + compliance hardening

### Entregáveis
- Métricas de policy hit/miss, latência de approval, fila outbox.
- Rotina de verificação da hash-chain do audit.
- Alarmes para backlog de sincronização.

### Critério de aceite
- Evidências de compliance reproduzíveis a partir do Postgres somente.

---

## Backlog técnico (ordem prática)

1. Criar migrations de domínio Postgres (Fase 1).
2. Introduzir camada `domain/*` e mover `requireAuthenticatedContext` (Fase 2).
3. Criar `domain_outbox` + worker de sync para Convex (Fase 3).
4. Implementar rota de chat via Vercel AI SDK com gates de policy/HITL (Fase 4).
5. Remover responsabilidades de domínio do Convex (Fase 5).

---

## Riscos e mitigação

- **Risco:** inconsistência entre Postgres e Convex durante migração.
  - **Mitigação:** outbox transacional + idempotência + backfill.

- **Risco:** regressão de autorização em endpoints antigos.
  - **Mitigação:** testes de contrato RBAC (read/write/admin) por rota.

- **Risco:** latência extra por validação policy/HITL.
  - **Mitigação:** cache de leitura para policies + UX de estado pendente.

---

## Definição de pronto (DoD)

- Toda decisão de acesso e governança é auditável no Postgres.
- Convex pode ser reconstruído por replay de projeções/eventos.
- LLM é acessado exclusivamente via Vercel AI SDK.
- Não existe caminho de produção que bypass policy/approval.
