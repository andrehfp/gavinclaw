# Stage 1: Event Capture

> Part of the [[../flow|Intelligence Flow]]
> Upstream: External events
> Downstream: [[02-queue|Queue]]

**Purpose:** Hooks into Claude Code to capture tool events, make predictions, and start EIDOS steps.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Last cycle | 1m ago | healthy |
| Scheduler | 4s ago | healthy |
| Watchdog | unknown | WARNING |
| Errors last cycle | 0 | healthy |
## Source Files

- `hooks/observe.py` — Core implementation
- `~/.spark/bridge_worker_heartbeat.json` — State storage
- `~/.spark/scheduler_heartbeat.json` — State storage
- `~/.spark/watchdog_state.json` — State storage
