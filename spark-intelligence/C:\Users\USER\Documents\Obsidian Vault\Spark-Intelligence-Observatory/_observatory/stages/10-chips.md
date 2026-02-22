# Stage 10: Chips

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[03-pipeline|Pipeline]]
> Downstream: [[08-advisory|Advisory]]

**Purpose:** Domain-specific intelligence modules. Each chip stores patterns, observations, and insights for its domain. Chips inject advice during advisory retrieval.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Active chips | 0 | healthy |
| Total size | 0B | healthy |
## Source Files

- `lib/chips/ (runtime.py, store.py)` — Core implementation
- `~/.spark/chip_insights/*.jsonl` — State storage
