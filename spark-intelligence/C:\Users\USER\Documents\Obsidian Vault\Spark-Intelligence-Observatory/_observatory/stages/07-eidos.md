# Stage 7: EIDOS

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[03-pipeline|Pipeline]] | [[11-predictions|Predictions]]
> Downstream: [[08-advisory|Advisory]]

**Purpose:** Episodic intelligence with mandatory predict-then-evaluate loop. Stores episodes (session-scoped), steps (prediction/outcome/evaluation triples), and distillations (extracted rules).
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Database | exists | healthy |
| DB size | 72.0KB | healthy |
| Episodes | 0 | healthy |
| Steps | 0 | healthy |
| Distillations | 0 | healthy |
| Active episodes | 0 | healthy |
| Active steps | 0 | healthy |
## Source Files

- `lib/eidos/ (aggregator.py, distiller.py, store.py, models.py)` — Core implementation
- `~/.spark/eidos.db` — State storage
- `~/.spark/eidos_active_episodes.json` — State storage
- `~/.spark/eidos_active_steps.json` — State storage
