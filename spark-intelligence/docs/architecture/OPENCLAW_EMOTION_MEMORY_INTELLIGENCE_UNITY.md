# OpenClaw Emotion-Memory-Intelligence Unity

Date: 2026-02-18  
Owner: Spark Intelligence  
Status: Active architecture baseline

## Purpose

Define how OpenClaw runtime events, Spark emotional state, memory, and advisory retrieval should work as one connected system with safe fallbacks.

## System Boundaries

- OpenClaw is the event producer (user prompts, tool calls, tool outcomes).
- Spark Intelligence is the retrieval/advisory and memory decision layer.
- Spark Consciousness is the bounded emotional context producer (`bridge.v1`).
- Memory is a major signal, not the only signal. Semantic relevance remains dominant.

## Runtime Flow

1. OpenClaw emits runtime events into `sparkd`.
2. `sparkd.py` maps events to queue types:
- `message(user)` -> `USER_PROMPT`
- `tool(call)` -> `PRE_TOOL`
- `tool(result success)` -> `POST_TOOL`
- `tool(result error)` -> `POST_TOOL_FAILURE`
3. `sparkd.py` dispatches OpenClaw bridge hooks:
- advisory callbacks: `on_user_prompt`, `on_pre_tool`, `on_post_tool`
- emotion hooks: trigger or recovery
4. Memory/advisory retrieval runs in `lib/advisor.py` with emotion-aware rerank behind `memory_emotion.*` tuneables.
5. Advisory synthesis resolves consciousness strategy from `bridge.v1` (safe bounded influence).
6. Output adapters publish advisory/context back to OpenClaw surfaces.

## Contract Alignment

Consciousness contract path:
- `~/.spark/bridges/consciousness/emotional_context.v1.json`

Producer (consciousness repo):
- `publishEmotionalContextContractV1(...)`
- Env override: `SPARK_CONSCIOUSNESS_BRIDGE_PATH`

Consumer (intelligence repo):
- `lib/consciousness_bridge.py` (`resolve_strategy`)
- Validates `schema_version == bridge.v1`
- Enforces boundaries and freshness TTL
- Fails closed to neutral strategy

## Tuneable Gates

OpenClaw runtime bridge gates (`openclaw_runtime`):
- `advisory_bridge_enabled`
- `emotion_updates_enabled`
- `emotion_trigger_intensity`
- `async_dispatch_enabled`

Emotion-aware retrieval gates (`memory_emotion`):
- `enabled`
- `advisory_rerank_weight`
- `advisory_min_state_similarity`
- retrieval/write capture controls already present in memory stack

## What Is Working Now

- OpenClaw runtime bridge path is live in `sparkd.py`.
- Cognitive insight writes now capture emotion snapshots.
- Consciousness publisher and intelligence reader now share the same default bridge path.
- Tests covering these links are present and passing.

## What Is Still Missing For Strong Unity

1. Signal density
- Most historical cognitive/memory entries do not yet carry emotion metadata.
- Result: emotion-aware retrieval has limited practical leverage.

2. Reconsolidation loop
- Tool outcomes update advisory/emotion state, but memory confidence updates are not yet fully wired as a first-class reconsolidation loop.

3. Rollout governance
- Need codified production A/B promotion gate for emotion-state weight on real OpenClaw corpus.

4. Bridge observability
- Need explicit health alerts for stale/missing bridge payload and schema drift.

## Task System (Implementation Order)

1. `U1` Backfill + write enforcement
- Backfill emotion tags into high-value legacy memories and insights.
- Enforce emotion tags on new writes.

2. `U2` Outcome reconsolidation worker
- Convert post-tool outcomes into memory confidence updates with evidence traces.

3. `U3` Real-corpus A/B governance
- Sweep `emotion_state_weight` (`0.0` to `0.4`) and promote only on quality gain with latency/error guardrails.

4. `U4` Health and drift checks
- Add bridge freshness/schema checks to routine Spark health reporting.

## Definition Of Done

- Emotional metadata has enough coverage to influence ranking materially.
- Retrieval/advisory quality improves on real OpenClaw workloads with guardrails intact.
- Bridge failures are visible quickly.
- Rollback remains one tuneable change away.
