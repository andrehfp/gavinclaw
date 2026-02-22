# Prediction-Outcome Loop

This document defines how Spark's prediction/outcome loop works and how to plug
outcome data into the correct stores so reliability updates are trustworthy.

Primary implementation:
- `lib/prediction_loop.py`
- `lib/outcome_log.py`
- `spark/cli.py`
- `hooks/observe.py`
- `lib/bridge_cycle.py`

## Why This Loop Exists

Spark should not only store insights. It should test them against outcomes.

The loop turns:
1. surfaced insights (`exposures`)
2. into predictions
3. then links real outcomes
4. then updates reliability/validation counters.

## Runtime Flow

Bridge cycle runs `process_prediction_cycle()` inside `lib/bridge_cycle.py`.

1. `build_predictions()`
- reads recent exposures from `~/.spark/exposures.jsonl`
- creates prediction rows in `~/.spark/predictions.jsonl`
- enforces source budgets and total budget to avoid one source dominating.

2. `build_project_predictions()`
- adds project-done and project-milestone predictions from `~/.spark/projects/*.json`.

3. `collect_outcomes()`
- consumes queue events and appends outcomes to `~/.spark/outcomes.jsonl`.
- captures:
  - explicit positive/negative user messages (`USER_PROMPT`)
  - tool failures (`POST_TOOL_FAILURE`)
  - tool successes (`POST_TOOL`) for meaningful tools.

4. `auto_link_outcomes()` (scheduled)
- links unlinked outcomes to insights by similarity on an interval.

5. `match_predictions()`
- matches predictions to outcomes with:
  - hard links first (`entity_id`, explicit links, `trace_id`)
  - then semantic/token similarity
  - type-adaptive windows (e.g. principle > workflow > general).

6. Reliability update
- validated predictions boost insight validation/evidence.
- contradicted predictions add counter-examples and can trigger surprises.

7. KPI computation
- prod-only KPIs are computed from recent predictions/outcomes and match history.

## Data Contract: Prediction Rows

Stored in `~/.spark/predictions.jsonl`.

Key fields:
- `prediction_id` (required)
- `text`, `type`, `expected_polarity`, `created_at`, `expires_at`
- `insight_key` (if tied to cognitive insight)
- `source`, `session_id`, `trace_id`
- `entity_id` (for project/milestone hard linking)
- `namespace` (`prod` or `test`)

## Data Contract: Outcome Rows

Stored in `~/.spark/outcomes.jsonl`.

Minimum required for useful matching:
- `outcome_id`
- `event_type`
- `text`
- `polarity` (`pos`/`neg`/`neutral`)
- `created_at`

Strongly recommended for correct routing/attribution:
- `session_id`
- `trace_id`
- `namespace` (`prod` for real runs, `test` for CI/harness)
- `linked_insights` (list of `insight_key` when known)
- `entity_id` (project outcome linkage)

## What Goes Where (Outcome Plumbing Map)

Use this routing map so outcome data lands in the correct subsystem.

1. Tool execution success/failure from terminal hooks
- Route: `hooks/observe.py` -> queue events -> `collect_outcomes()`
- Why: preserves event chronology/session linkage and automatic conversion to
  `tool_success` / `tool_error`.

2. Explicit human outcome check-ins
- Route: `python -m spark.cli outcome ...`
- Why: writes explicit outcomes and can attach `linked_insights`.

3. Project completion/milestone completion
- Route: `python -m spark.cli project capture --type done ...`
  or milestone with completed status.
- Why: writes `project_outcome` with `entity_id` for hard-link matching.

4. Orchestration/handoff result outcomes
- Route: `lib/orchestration.py` -> `append_outcomes(...)` (`handoff_result`)
- Why: updates orchestration feedback and keeps outcomes in shared log.

5. Skill effectiveness outcomes
- Route: `lib/feedback.py` -> `append_outcomes(...)` (`skill_result`)
- Why: skill success/failure contributes to loop evidence.

6. External scorer outcomes (Spark Forge, Opus/Codex evaluators)
- Route: write directly with `lib.outcome_log.append_outcome` or
  `append_outcomes`.
- Why: fastest non-API path when scores are generated from local terminals.

## Integrating External Scorers (No API Path)

If Opus/Codex scoring runs locally in terminals, push scored outcomes into
`outcomes.jsonl` with a stable contract.

Recommended row shape:

```python
from lib.outcome_log import append_outcome, make_outcome_id
import time

now = time.time()
append_outcome({
    "outcome_id": make_outcome_id("spark-forge", "run-123", "codex"),
    "event_type": "forge_scorer_result",
    "text": "Codex score improved from 6.1 to 7.0 on patch quality",
    "polarity": "pos",
    "created_at": now,
    "session_id": "forge:run-123",
    "trace_id": "forge-run-123-codex",
    "namespace": "prod",
    "linked_insights": ["some_insight_key_if_known"],
})
```

Rules:
- Use `namespace="test"` for benchmark runs/CI so reliability is not polluted.
- Reuse the same `trace_id` from exposure/prediction context when possible.
- Include `linked_insights` or `entity_id` when you already know the target.

## Local Ops Commands

Main checks:
- `python -m spark.cli status`
- `python -m spark.cli outcome-stats`
- `python -m spark.cli outcome-unlinked --limit 20`
- `python -m spark.cli auto-link --min-similarity 0.25 --limit 80`
- `python -m spark.cli eval --days 7`

Manual explicit outcome:
- `python -m spark.cli outcome --result yes --text "worked" --auto-link`

## Prediction Loop Tuneables

Prediction generation budgets:
- `SPARK_PREDICTION_TOTAL_BUDGET`
- `SPARK_PREDICTION_DEFAULT_SOURCE_BUDGET`
- `SPARK_PREDICTION_SOURCE_BUDGETS`
  - format example: `chip_merge=80,spark_inject=60,sync_context=40`

Auto-link scheduling:
- `SPARK_PREDICTION_AUTO_LINK`
- `SPARK_PREDICTION_AUTO_LINK_INTERVAL_S`
- `SPARK_PREDICTION_AUTO_LINK_LIMIT`
- `SPARK_PREDICTION_AUTO_LINK_MIN_SIM`

Namespace control:
- `SPARK_NAMESPACE=prod|test`

## KPI Definitions (Prod-Only)

Exposed in `spark status` and `spark outcome-stats`.

- `prediction_to_outcome_ratio`
  - predictions / outcomes over the KPI window.
- `unlinked_outcomes`
  - outcomes with no explicit link.
- `coverage`
  - matched predictions / predictions.
- `validated_per_100_predictions`
  - validated matches per 100 predictions.

Interpretation:
- High ratio + low coverage means over-predicting or under-capturing outcomes.
- High unlinked outcomes means routing/linking quality issue, not just volume.
- Low validated/100 with many outcomes usually indicates poor linkability
  (missing `trace_id`, `linked_insights`, or `entity_id`).

## Integration Checklist (Spark Intelligence + Spark Forge)

1. Ensure hooks are active so tool events are captured.
2. Ensure exposures are being recorded for surfaced insights.
3. Send external scorer outcomes through `append_outcome(s)` with `trace_id`.
4. Tag tests with `namespace=test`.
5. Run `spark auto-link` on a schedule if unlinked outcomes grow.
6. Monitor `spark outcome-stats` KPIs weekly and adjust budgets/tuneables.

