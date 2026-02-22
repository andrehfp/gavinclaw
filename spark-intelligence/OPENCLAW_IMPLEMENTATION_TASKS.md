# OpenClaw Implementation Tasks (Actionable Backlog)

Purpose:
Turn the OpenClaw trend queue contract into concrete buildable tasks with direct acceptance criteria.

Legend:
- **Priority**: P0 (must do), P1, P2, P3
- **Input → Output**: what the task reads and writes
- **DoD**: Definition of Done

---

## P0-1) Build queue consumer core

### 1. Create trend queue worker entrypoint
- **Priority**: P0
- **Scope**: OpenClaw repo (new file)
- **Suggested path**: `services/trend_queue_worker.py`
- **Input**:
  - `~/.openclaw/workspace/spark_build_queue/latest_build_queue.json`
  - optional state file `~/.openclaw/workspace/spark_build_queue/worker_state.json`
- **Output**:
  - Updates `worker_state.json` with job lifecycle events
  - stdout/stderr logs
  - optional completion events
- **Task**:
  1. Load manifest JSON; if missing or malformed, fail with explicit error + next-poll message.
  2. Validate top-level keys: `run_id`, `jobs` (array).
  3. For each job, apply dedupe rules:
     - skip if `(job_id, run_id)` already completed.
     - skip if `(job_id, run_id)` currently running and older than `running_ttl_seconds`? (choose default).
  4. Add job to in-memory processing order by:
     - higher priority (`high` > `medium` > `low`)
     - then lower `job_id` order
  5. Dispatch each to engine runner (see Task 2-4).
- **DoD**:
  - Running worker on a sample queue processes only valid jobs.
  - No duplicate `job_id` execution for same `run_id`.
  - State file transitions include `queued -> running -> done/failed`.

---

## P0-2) Engine runner adapter: codex

- **Priority**: P0
- **Scope**: OpenClaw repo
- **Suggested path**: `services/engines/codex_runner.py`
- **Input**:
  - `job` object where `assigned_engine == "codex"`
- **Output**:
  - execution result object:
    - `status`
    - `artifacts`
    - `error` (if failed)
- **Task**:
  - Implement `run(job)` with:
    - input normalization from job fields (`target_path`, `source_payload`, `one_shot_spawn`, `why_build_now`)
    - call existing codex execution path in OpenClaw environment
    - return structured result
- **DoD**:
  - Function executes successfully against mock job.
  - Produces deterministic result shape on success/failure.

---

## P0-3) Engine runner adapter: minimax

- **Priority**: P0
- **Scope**: OpenClaw repo
- **Suggested path**: `services/engines/minimax_runner.py`
- **Input / Output**: same pattern as Task 2
- **Task**:
  - Implement `run(job)` for MCP-style jobs.
  - Respect `target_path` and preserve idempotency.
- **DoD**:
  - Mock job execution works.
  - MCP artifact path is created/updated under the configured `target_path`.

---

## P0-4) Engine runner adapter: opus

- **Priority**: P0
- **Scope**: OpenClaw repo
- **Suggested path**: `services/engines/opus_runner.py`
- **Input / Output**: same pattern as Task 2
- **Task**:
  - Implement `run(job)` for startup/MVP style jobs.
  - Route candidates to startup workflow with launch-pack context.
- **DoD**:
  - Mock job execution works.
  - `startup`-type output is generated at `target_path`.

---

## P0-5) Unified dispatcher/router

- **Priority**: P0
- **Scope**: OpenClaw repo
- **Suggested path**: `services/engines/dispatch.py`
- **Input**:
  - normalized `job` + engines map
- **Output**:
  - engine result object or explicit routing error
- **Task**:
  - Implement canonicalization:
    - `codex`, `minimax`, `opus` accepted
  - Validate unknown engine and route to error state.
- **DoD**:
  - Invalid engine fails fast with clear error string.
  - Valid engines route correctly.

---

## P1-1) Job state persistence and idempotent storage

- **Priority**: P1
- **Scope**: OpenClaw repo
- **Suggested path**: `services/state/job_state.py`
- **Input**:
  - worker run events, job_id, run_id, assigned_engine
- **Output**:
  - durable state JSON/SQLite table
- **Task**:
  - Persist records:
    - `job_id`, `run_id`, `status`, `assigned_engine`, `attempts`, `last_error`, `updated_at`, `result`.
  - Provide `is_complete`, `mark_running`, `mark_done`, `mark_failed`.
- **DoD**:
  - Restarting worker does not re-execute done jobs.
  - Retry count increments on failure.

---

## P1-2) Retry and dead-letter behavior

- **Priority**: P1
- **Scope**: OpenClaw repo
- **Suggested path**: `services/retry.py`
- **Input**:
  - failed execution result and worker state
- **Output**:
  - retried job mark or dead-letter entry
- **Task**:
  - Default max retries: `3`
  - Exponential backoff.
  - If max exceeded -> move to dead-letter list in state file.
- **DoD**:
  - Failure test retries and eventually dead-letters after `max_retries`.

---

## P1-3) CLI / scheduler trigger integration

- **Priority**: P1
- **Scope**: OpenClaw repo
- **Suggested path**: `main.py` or CLI module
- **Input**: CLI flag `--run-trend-queue`
- **Output**:
  - one worker loop execution cycle
- **Task**:
  - Add command or task that invokes worker.
  - Add optional polling interval argument.
- **DoD**:
  - One command can run one pass and exit with summary.

---

## P1-4) Queue manifest validation

- **Priority**: P1
- **Scope**: OpenClaw repo
- **Suggested path**: `services/validation/queue_schema.py`
- **Input**:
  - raw manifest JSON
- **Output**:
  - validated manifest object + warnings list
- **Task**:
  - Validate required keys and type checks.
  - Keep tolerant behavior: unknown fields allowed but logged.
- **DoD**:
  - Invalid manifest returns explicit issues and does not execute jobs.

---

## P2-1) Cost + concurrency policy

- **Priority**: P2
- **Scope**: OpenClaw repo
- **Input**: config/env
- **Output**:
  - bounded concurrent execution and cost-aware throttling
- **Task**:
  - Add env controls:
    - `OPENCLAW_TREND_MAX_PARALLEL=3`
    - `OPENCLAW_TREND_MAX_RETRIES=3`
    - `OPENCLAW_TREND_RETRY_BASE_SECONDS=30`
- **DoD**:
  - Defaults exist and are honored by worker.

---

## P2-2) Completion eventing

- **Priority**: P2
- **Scope**: OpenClaw repo
- **Suggested path**: `services/events.py`
- **Input**: job final state
- **Output**:
  - event record for downstream visibility
- **Task**:
  - Emit completion summaries per run and per job to local JSONL or webhook.
- **DoD**:
  - Every terminal job state has an emitted event.

---

## P2-3) Dashboard status endpoint (optional)

- **Priority**: P2
- **Scope**: OpenClaw repo
- **Suggested path**: existing dashboard service
- **Task**:
  - Add endpoint/metric for:
    - queue run id
    - jobs queued/running/done/failed
    - per-engine throughput
- **DoD**:
  - Live status can be queried during a run.

---

## P3-1) Feedback scoring and future tuning

- **Priority**: P3
- **Scope**: both repos
- **Suggested path**:
  - scheduler: record queue quality metrics
  - x-builder: add optional `trend_quality_feedback` input
- **Task**:
  - Append `post_run_feedback` record linking executed jobs -> outcomes.
  - Use for future threshold adjustments.
- **DoD**:
  - feedback file writes at run end without blocking.

---

## P3-2) Repo routing policy for startup ideas

- **Priority**: P3
- **Scope**: OpenClaw + spark-x-builder mapping
- **Task**:
  - Decide if startup jobs stay in same root or dedicated startup workspace.
  - Update default target paths accordingly.
- **DoD**:
  - clear policy and docs update, no ambiguity.

---

## 4) Suggested implementation order (fastest path)

1. P0-1, P0-5, P0-2, P0-3, P0-4
2. P1-1, P1-2, P1-3, P1-4
3. P2-1, P2-2
4. P3 tasks

---

## 5) Mapping to current docs

- Flow contract and schemas: `TREND_FLOW_SCHEMA.md`, `OPENCLAW_TREND_FLOW_BRIEF.md`, `OPENCLAW_FULL_SYSTEM_BRIEF.md`
- Scheduler/queue behavior verified in `spark_scheduler.py`
- Candidate generation and controls in `scripts/daily_trend_research.py` (spark-x-builder repo)

