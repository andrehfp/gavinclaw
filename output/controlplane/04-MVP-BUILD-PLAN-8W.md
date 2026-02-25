# MVP Build Plan — 8 semanas

## Semana 1-2
- Auth (OIDC/JWT), tenants e RBAC
- API gateway unificado
- banco base + audit_events

## Semana 3-4
- Policy engine pre/post (mask/block/warn)
- quotas e budget por projeto
- dashboard básico de uso/custo

## Semana 5-6
- HITL para ações críticas
- trilha auditável append-only + checksum
- export CSV/PDF

## Semana 7-8
- hardening, testes de carga e segurança
- setup de piloto com conta real
- ajustes finais

## Critérios técnicos
- p95 overhead gateway < 300ms
- 0 perda de eventos de auditoria
- 100% write actions logadas

## Definição de pronto (DoD)
- teste unit e integração passando
- endpoint documentado
- log estruturado
- permissão validada por role
