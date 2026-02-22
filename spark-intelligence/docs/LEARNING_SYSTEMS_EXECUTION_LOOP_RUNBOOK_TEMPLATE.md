# Spark Learning Systems Execution Runbook Template

Use this template for every execution window.

## Run metadata

- Run ID:
- Date/Time (UTC):
- Operator:
- Trigger source (`manual` / `timer` / `event` / `other`):
- Objective (one sentence):
- Budget snapshot before run (`/budget`):
- Mode before run (`/status.mode`):

## Preflight snapshot

Capture all values in this section before any actions:

1. Executive loop
   - `GET /status`
   - `GET /plan`
   - `GET /budget`
   - `GET /history?limit=20`
2. Learning systems
   - `GET /api/status`
   - `GET /api/layers`
   - `GET /api/run/status`
3. Observability + advisory
   - `GET /api/status` (port 8765)
   - `GET /api/services` (port 8765)
   - `GET /api/trace?limit=20` (port 8765)
   - `GET /health` (ports 8787, 8780, 8790, 8080)

### Baseline deltas (fill)

- Total systems healthy:
- Total systems warning:
- Total systems critical:
- Total systems not_run:
- Consciousness score / CI metrics:
- Growth score / CI metrics:
- External advisory health:
- Execution budget remaining:
- Signals in plan:

## Action plan

Use one goal per run step and tie it to a layer/system.

| Step | Timestamp | Target | Method | Expected evidence of success | Command |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

## Execute (record exact behavior)

### Step 1

- Command:
- Response snippet:
- Duration:
- Immediate status after step:
- Error status (if any):

### Step 2

- Command:
- Response snippet:
- Duration:
- Immediate status after step:
- Error status (if any):

### Step 3

- Command:
- Response snippet:
- Duration:
- Immediate status after step:
- Error status (if any):

## Post-run validation

Capture all values again in this section:

- `GET /history?limit=50`
- `GET /api/layers`
- `GET /api/status`
- `GET /api/run/status`
- `GET /api/trace?limit=50` (port 8765)
- `GET /api/services` (port 8765)
- `GET /budget`

### Delta summary

- Change in critical systems:
- Change in warning systems:
- Change in not_run systems:
- Plan signal reduction/increase:
- Budget used this run:
- Any merges/pushes performed:
- Any safety violations:

## Keep / Rollback decision

- Decision: `KEEP` / `ROLLBACK` / `PAUSE-REFACTOR`
- Why:
- Evidence references:
  - History IDs:
  - Layer diffs:
  - Trace IDs:

## If rollback is required

Run these exact commands and capture evidence:

- `POST /pause`
- `POST /kill`
- Root-cause summary:

## Final state

- Mode:
- Run result (`success` / `partial` / `failed`):
- Next action:
- Next scheduled run:

## Human review notes

- Risks observed:
- Unexpected behavior:
- Improvements to runbook:

---

# Minimal JSON payload template (optional machine parsing)

```json
{
  "run_id": "",
  "timestamp_utc": "",
  "operator": "",
  "objective": "",
  "trigger": "manual",
  "preflight": {
    "status": {},
    "plan": {},
    "budget": {},
    "history_tail": [],
    "system_status": {},
    "layers": {},
    "spark_services": {}
  },
  "actions": [
    {
      "step": 1,
      "target": "",
      "command": "",
      "response": "",
      "error": "",
      "timestamp_start": "",
      "timestamp_end": ""
    }
  ],
  "post_run": {
    "history": {},
    "layers": {},
    "system_status": {},
    "run_status": {},
    "trace": {},
    "budget": {}
  },
  "decision": "KEEP",
  "rationale": "",
  "rollback_required": false,
  "human_notes": ""
}
```

---

## Linking this template

- Store completed runs as `docs/reports/execution-run-YYYYMMDD-HHMM.md`.
- Keep raw API JSON snapshots in your workspace for audit trails.
- Keep one run per file; do not overwrite previous run records.

