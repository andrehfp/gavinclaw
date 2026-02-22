# Stage 2: Queue

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[01-event-capture|Event Capture]]
> Downstream: [[03-pipeline|Pipeline]]

**Purpose:** Buffers events from hooks for batch processing. Uses append-only JSONL with overflow sidecar for lock contention.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Estimated pending | ~0 | healthy |
| Events file size | 0B | healthy |
| Head bytes | 0 | healthy |
| Overflow active | no | healthy |
| Last write | never | healthy |
## Source Files

- `lib/queue.py` — Core implementation
- `~/.spark/queue/events.jsonl` — State storage
- `~/.spark/queue/state.json` — State storage
- `~/.spark/queue/events.overflow.jsonl` — State storage
