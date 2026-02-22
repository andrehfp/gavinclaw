# InstaRelay MVP — Plano de Implementação (14 dias)

## Objetivo
Validar rápido se existe PMF para **Instagram Ops Reliability**:
- publish confiável
- comentários pendentes com resposta assistida
- analytics semanal/mensal

## Fase 0 (Dia 1)
- [x] Definir arquitetura MVP e specs
- [x] Criar skeleton backend com jobs assíncronos
- [x] Refatorar para Codex App Server (planner) + InstaCLI (executor)
- [ ] Integrar primeiros comandos InstaCLI live (photo + inbox)

## Fase 1 (Dias 2-5) — Core operacional
- [ ] `POST /jobs/publish/photo`
- [ ] `POST /jobs/comments/inbox`
- [ ] `GET /jobs/{id}` com timeline de eventos
- [ ] Logs básicos por job
- [ ] Guardrail: conta alvo obrigatória

## Fase 2 (Dias 6-9) — Valor diário
- [ ] `POST /jobs/comments/reply` (modo manual)
- [ ] `POST /jobs/analytics/summary` (7/30 dias)
- [ ] Retry básico para erro transitório
- [ ] Idempotency key no publish

## Fase 3 (Dias 10-14) — Validação comercial
- [ ] Onboarding simples de 10 testers
- [ ] Rodar 2 semanas com uso real
- [ ] Coletar métricas de Go/No-Go

## Métricas Go / No-Go
### Técnica
- Publish success rate > 95%
- Conta errada = 0
- Latência média publish < 90s

### Produto
- 10 testers ativos
- >= 40% usando inbox 3x/semana
- >= 30% retornando na semana 2

### Comercial
- >= 2 pagantes em 14 dias

## Se falhar
Pivot para:
1. API infra-only (publish + logs)
2. Comments Copilot
3. Content ops com human-in-the-loop
