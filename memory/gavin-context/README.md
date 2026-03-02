# Gavin Context Ops (AFS-lite)

Objetivo: tornar decisões do agente rastreáveis com 3 artefatos por turno:

1. **Manifest**: o que entrou no contexto e por quê
2. **Events**: etapas relevantes da execução
3. **Eval**: qualidade final, risco e próximos passos

## Arquivos

- `memory/gavin-context/manifests.jsonl`
- `memory/gavin-context/events.jsonl`
- `memory/gavin-context/evals.jsonl`
- `memory/gavin-context/policy.json`

## CLI

```bash
gavin-context manifest \
  --objective "Implementar X" \
  --task-type execution \
  --source "workspace:arquivos locais:1200" \
  --source "memory_search:decisões prévias:500"

# retorna turn_id

gavin-context event \
  --turn-id <TURN_ID> \
  --phase implementation \
  --note "feature criada"

gavin-context eval \
  --turn-id <TURN_ID> \
  --status ok \
  --confidence 0.9 \
  --outcome "implementado com testes"

gavin-context replay --turn-id <TURN_ID>

# Daily report (markdown)
gavin-context report --tz America/Sao_Paulo --out memory/gavin-context/reports/$(date +%F).md

# Wrapper
# (usa America/Sao_Paulo e salva em memory/gavin-context/reports/YYYY-MM-DD.md)
gctx report
gctx report 2026-03-01
```

## Política padrão de budget

- heartbeat: 1200
- ops: 2000
- analysis: 4000
- execution: 5000
- strategy: 6500

Pode ajustar em `policy.json`.
