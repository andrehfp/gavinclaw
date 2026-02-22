# Advisory Intelligence Flow Tasks

Goal: make Spark advisory memory/share behavior consistently distill → transform → deliver usable advice in the right context.

## Current Task Queue (Do in order)

1. [x] **Task 1 — Capture richer advisory metadata at intake**
   - `hooks/observe.py`
   - Score incoming user/tool events for advisory-readiness and attach domain hints.
   - Done: event-level readiness and domain hints now stored as `data["advisory"]`.

2. [x] **Task 2 — Persist advisory readiness in cognitive storage**
   - `lib/cognitive_learner.py`
   - Add `advisory_readiness` on `CognitiveInsight` with backfill support.
   - Done: new field and read/write persistence.

3. [x] **Task 3 — Include readiness + domain in advisory retrieval ranking**
   - `lib/advisor.py`
   - Use `advisory_readiness`/quality signals in prefilter and ranking.
   - Enforce cross-domain filtering.
   - Done: readiness-aware prefilter/rank and implemented cross-domain gate.

4. [x] **Task 4 — Prefer ready/adaptable insights in context sync output**
   - `lib/context_sync.py`
   - Re-rank injected insights by readiness and log diagnostic values.
   - Done.

5. [x] **Task 5 — Transform user-signal learnings into advisory-ready shape**
   - `lib/cognitive_signals.py`
   - Run user-derived learnings through advisory transformation before storing.
   - Carry `advisory_quality` payload into `CognitiveLearner`.

6. [x] **Task 6 — Propagate advisory-readiness through memory fusion**
   - `lib/advisory_memory_fusion.py`
   - Compute and carry `advisory_readiness` on evidence rows.
   - Use readiness as a ranking signal for final bundle selection.

## Future follow-ups (next queue)

7. [x] **Task 7 — Add advisory readiness fields to mind/offline memory sources**
   - `lib/mind_bridge.py`, `lib/bridge_cycle.py`, and any offline queue writers/serializers
   - Goal: every memory source participating in advisory retrieval carries `advisory_readiness` and `advisory_quality`.
   - Done: mind payloads now include advisory meta, offline queue persists it, and advisory retrieval consumers accept it for ranking.

8. [x] **Task 8 — Add periodic 20-question quality audit and scorecard**
   - `docs/ADVISORY_FLOW_SCORECARD.md`
   - Done: flow-wide scoring completed with recommendations/optimizations by part.

## Strip-down follow-up queue

9. [x] **Task 9 — Emit machine-readable advisory artifact with sync writes**
   - `lib/context_sync.py`, `lib/output_adapters/*.py`
   - Goal: every sync target gets a deterministic JSON artifact (`SPARK_ADVISORY_PAYLOAD.json`) with advisory-readiness, reliability, and source metadata.
   - Done: payload emitted to adapters as `SPARK_ADVISORY_PAYLOAD.json` alongside text context.

10. [x] **Task 10 — Normalize source before queue write**
   - `hooks/observe.py`
   - Goal: canonicalize source metadata at intake before enqueue to queue for cross-adapter comparability.
   - Done: input source is normalized to stable low-noise identifiers before advisory payload and queue persistence.

11. [x] **Task 11 — Cap oversized hook payload text and add overflow hash**
   - `hooks/observe.py`
   - Goal: bound queue/event payload growth while preserving traceability via deterministic text hash.
   - Done: payload text is bounded with `text_len`, `text_hash`, and truncation metadata; `tool_input` is sanitized before queue write.

12. [x] **Task 12 — Add advisory quarantine sink for dropped/suppressed rows**
   - `lib/advisory_quarantine.py`, `lib/advisory_memory_fusion.py`, `lib/bridge_cycle.py`
   - Goal: retain suppressed/noisy candidates in an audit sink instead of silently dropping them.
   - Done: drops are written as compact rows to `~/.spark/advisory_quarantine/advisory_quarantine.jsonl` with `source`, `stage`, `reason`, and bounded `text_snippet`.

13. [x] **Task 13 — Record final advisor drops in quarantine**
   - `lib/advisor.py`
   - Goal: include last-stage suppression/noise drops in the same quarantine audit trail.
   - Done: `_should_drop_advice` now records dropped advice with explicit `advisor_should_drop` reasons before filtering.

14. [x] **Task 14 — Add source-mode signal to advisory evidence rows**
   - `lib/advisory_memory_fusion.py`
   - Goal: tag fused evidence rows with compact `source_mode` for cleaner source-aware audit and tuning.
   - Done: evidence rows now carry `source_mode` (`cognitive`, `eidos`, `chip`, `outcome`, `orchestration`, `mind`).

15. [x] **Task 15 — Audit advisory-engine suppression drops**
    - `lib/advisory_engine.py`
    - Goal: mirror gate and suppression outcomes from advisory engine into quarantine for root-cause auditing.
    - Done: `_record_advisory_gate_drop` writes to quarantine at no-emit, fallback-rate-limit, fallback-duplicate, global dedupe, low-auth dedupe, and final duplicate suppression paths.
