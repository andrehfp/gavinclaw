# Stage 4: Memory Capture

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[03-pipeline|Pipeline]]
> Downstream: [[05-meta-ralph|Meta-Ralph]]

**Purpose:** Scans events for high-signal user intent (explicit markers + importance scoring). Detects domain hints and categorizes memories.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Pending memories | 0 | healthy |
| Last capture | never | healthy |
## Source Files

- `lib/memory_capture.py` — Core implementation
- `~/.spark/pending_memory.json` — State storage
- `~/.spark/memory_capture_state.json` — State storage
