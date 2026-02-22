# InstaRelay MVP (Codex App Server + InstaCLI)

Backend MVP para validar Instagram Ops Reliability com **Codex App Server como orquestrador** e **InstaCLI como executor**.

## Estrutura
- `IMPLEMENTATION_PLAN.md` — plano de execução 14 dias
- `SPECS.md` — especificação técnica e de produto
- `app/main.py` — API FastAPI
- `app/models.py` — schemas
- `app/store.py` — SQLite store de jobs
- `app/codex_client.py` — cliente do Codex App Server (`/v1/responses`)
- `app/instacli_exec.py` — mapeamento job -> comando InstaCLI
- `app/runner.py` — pipeline planner (Codex) + execution (InstaCLI)

## Rodar local
```bash
cd instarelay
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Variáveis de ambiente
```bash
# Codex App Server
export CODEX_APP_SERVER_URL="http://127.0.0.1:8765"
export CODEX_APP_SERVER_API_KEY=""
export CODEX_MODEL="gpt-5.3-codex"

# Execução
export INSTARELAY_CODEX_MOCK=1   # 1=ignora rede e usa planner fake
export INSTARELAY_EXEC_MODE=stub # stub|live
```

Subir API:
```bash
uvicorn app.main:app --reload --port 8090
```

Teste saúde:
```bash
curl http://127.0.0.1:8090/health
```

## Exemplo de job
```bash
curl -s -X POST http://127.0.0.1:8090/jobs/comments/inbox \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"ws_demo","account_name":"andrefprado","days":7,"limit":20}'
```

Consultar job:
```bash
curl -s http://127.0.0.1:8090/jobs/<job_id>
```

## Modo live
Para executar InstaCLI de verdade:
```bash
export INSTARELAY_CODEX_MOCK=0
export INSTARELAY_EXEC_MODE=live
```

## Segurança (MVP+)
- secrets vault / KMS
- confirm-account obrigatório em publish
- idempotency key
- webhook assinado
