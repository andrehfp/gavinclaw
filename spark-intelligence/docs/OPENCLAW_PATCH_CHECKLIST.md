# OpenClaw Patch-Ready Checklist (Dependency/Risk Ordered)

Method: production-first, real-work validation (not synthetic-only).
Rule: every patch must prove usefulness in live Spark/OpenClaw flow.

## Validation protocol (for every item)
1. Baseline metrics from live cycles (before)
2. Apply minimal patch
3. Run in active workflow (real user/tool activity)
4. Record deltas in `docs/OPENCLAW_RESEARCH_AND_UPDATES.md`
5. Keep / rollback decision

---

## P0 — Correctness blockers (do first)

### 1) Fix packet invalidation with file hints
- **Files:** `lib/advisory_packet_store.py`, `tests/test_advisory_packet_store.py`
- **Risk:** Medium
- **Depends on:** none
- **Done when:** edit/write on referenced files reliably invalidates stale packets.
- **Live metric:** repeated stale advice rate drops.

### 2) Fix implicit packet feedback effectiveness accounting
- **Files:** `lib/advisory_engine.py`, `lib/advisory_packet_store.py`, `tests/test_advisory_dual_path_router.py`
- **Risk:** Medium
- **Depends on:** none
- **Done when:** post-tool outcomes update packet effectiveness.
- **Live metric:** relaxed packet ranking quality improves over repeated sessions.

---

## P1 — Hook reliability + observability

### 3) Add advisory stage timing + error codes
- **Files:** `lib/advisory_engine.py`, `hooks/observe.py`
- **Risk:** Low
- **Depends on:** P0 recommended first
- **Done when:** logs show per-stage timing (`lookup/gate/synth/emit`) and structured failures.
- **Live metric:** easier latency diagnosis; fewer silent degradations.

### 4) Hook fail-open budget hardening
- **Files:** `hooks/observe.py`
- **Risk:** Medium
- **Depends on:** #3 preferred
- **Done when:** expensive pre-tool logic always respects time budget with explicit telemetry.
- **Live metric:** tool call responsiveness stays stable under load.

---

## P2 — Config consistency

### 5) Shared config runtime loader utility
- **Files:** `lib/config_runtime.py` (new), migrate advisory modules
- **Risk:** Medium
- **Depends on:** none
- **Done when:** advisory components use one config pattern.
- **Live metric:** fewer config surprises.

### 6) Normalize context env var naming
- **Files:** `lib/orchestration.py`, docs
- **Risk:** Low
- **Depends on:** #5 optional
- **Done when:** canonical var + alias support + docs aligned.

### 7) Dependency clarity for synthesis providers
- **Files:** `pyproject.toml`, `lib/advisory_synthesizer.py`, docs
- **Risk:** Low
- **Depends on:** none
- **Done when:** `httpx` strategy explicit (required or optional + warning).

---

## P3 — Structural hardening

### 8) Decompose `run_bridge_cycle()` into stages
- **Files:** `lib/bridge_cycle.py` (+ stage helpers)
- **Risk:** Medium/High
- **Depends on:** P0, P1 complete
- **Done when:** behavior unchanged but stage isolation/testability improved.

### 9) Expand runtime tuneables tests
- **Files:** `tests/test_runtime_tuneable_sections.py`
- **Risk:** Low
- **Depends on:** #5
- **Done when:** hot-apply vs restart-required behavior is tested.

### 10) Docs drift guardrails
- **Files:** `TUNEABLES.md`, `README.md`, `docs/OPENCLAW_OPERATIONS.md`
- **Risk:** Low
- **Depends on:** #5/#6
- **Done when:** docs match runtime; each section labeled hot-apply/restart-required.

---

## Suggested sprint order
- **Sprint A (today/tomorrow):** #1 + #2 + #3
- **Sprint B:** #4 + #5 + #6
- **Sprint C:** #7 + #8 + #9 + #10
