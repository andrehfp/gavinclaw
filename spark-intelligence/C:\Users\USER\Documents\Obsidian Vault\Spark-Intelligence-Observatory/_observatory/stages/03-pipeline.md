# Stage 3: Pipeline

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[02-queue|Queue]]
> Downstream: [[04-memory-capture|Memory Capture]] | [[05-meta-ralph|Meta-Ralph]] | [[07-eidos|EIDOS]] | [[10-chips|Chips]] | [[11-predictions|Predictions]]

**Purpose:** Processes event batches in priority order (HIGH > MEDIUM > LOW). Extracts patterns, tool effectiveness, error patterns, and session workflows.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Events processed | 0 | healthy |
| Insights created | 0 | healthy |
| Processing rate | 0.0 ev/s | healthy |
| Last batch size | 200 | healthy |
| Empty cycles | 4,881 | WARNING |
| Last cycle | never | healthy |
## Recent Cycles

| Duration | Events | Insights | Patterns | Rate | Health |
|----------|--------|----------|----------|------|--------|
| 0ms | 0 | 0 | 0 | 0 ev/s | healthy |
| 0ms | 0 | 0 | 0 | 0 ev/s | healthy |
| 0ms | 0 | 0 | 0 | 0 ev/s | healthy |
| 0ms | 0 | 0 | 0 | 0 ev/s | healthy |
| 0ms | 0 | 0 | 0 | 0 ev/s | healthy |

## Source Files

- `lib/pipeline.py + lib/bridge_cycle.py` — Core implementation
- `~/.spark/pipeline_state.json` — State storage
- `~/.spark/pipeline_metrics.json` — State storage
