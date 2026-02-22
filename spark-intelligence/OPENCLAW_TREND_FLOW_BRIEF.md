# OpenClaw Trend Automation Brief

This doc is the practical handoff package for OpenClaw: what exists now, where it writes artifacts, and how to consume them.

## 1) What exists today

You now have a two-stage trend-to-build flow:

1. `spark-x-builder` discovers trends and generates build candidates.
2. `spark_scheduler` reads the builder output, applies stricter viral-quality gates, and emits a queue manifest for OpenClaw.

Current push history includes:
- `vibeship-spark-intelligence`: queue gating + handoff + docs updates
- `spark-x-builder`: viral filters + query budgeting + cost controls

## 2) Repository responsibilities

- `spark-x-builder` (`scripts/daily_trend_research.py`)
  - Search X via `x-research` skill (if available) or `lib.x_client` fallback.
  - Apply engagement/freshness filters and per-run budget caps.
  - Produce `build_candidates` plus trend profile data.
  - Exit with JSON summary payload (stdout).
- `vibeship-spark-intelligence` (`spark_scheduler.py`)
  - Runs `spark-x-builder` daily.
  - Builds and writes OpenClaw-ready queue payload.
  - Persists handoff + queue metadata.
  - Emits optional webhook notifications to OpenClaw/Clawdbot.

## 3) Files and paths to consume

- Handoff file (scheduler output):
  - `~/.spark/claw_integration/latest_trend_handoff.json`
- Latest queue manifest:
  - `~/.openclaw/workspace/spark_build_queue/latest_build_queue.json`
- Queue snapshot:
  - `~/.openclaw/workspace/spark_build_queue/trend_build_queue_<RUN_ID>.json`
- Dispatch log:
  - `~/.spark/claw_integration/build_dispatch_log.jsonl`

## 4) Build queue record fields (required for OpenClaw)

Queue manifest top-level:

```json
{
  "run_id": "YYYYMMDD_HHMMSS",
  "generated_at": "ISO8601",
  "source": "spark_scheduler.daily_research",
  "run_status": "completed",
  "topics_processed": 6,
  "stats": {
    "trends_evaluated": 6,
    "trends_selected": 2,
    "queue_count": 3,
    "trends_filtered": 4
  },
  "jobs": [ ... ]
}
```

Each `jobs[]` entry should be treated as immutable execution unit:

```json
{
  "job_id": "skill_1718000000_1",
  "source_bucket": "skills",
  "build_type": "skill",
  "build_name": "vibe-coding-trend-assistant",
  "title": "Vibe Coding Trend Assistant",
  "assigned_engine": "codex",
  "source_topic": "vibe_coding",
  "confidence": 0.83,
  "trend_rank": 1,
  "target_path": "/trend-builds/codex/skills/vibe-coding-trend-assistant",
  "priority": "high",
  "why_build_now": "Recurring patterns suggest repeatable task automation.",
  "launch_pack": { "...": "..." },
  "trend_profile": {
    "trend_score": 0.81,
    "evidence_count": 14,
    "trend_rank": 1
  },
  "build_plan": {
    "target_engine": "codex",
    "automation_root": "...",
    "target_path": "..."
  },
  "one_shot_spawn": { "...": "..." },
  "source_payload": { "...original candidate data..." },
  "run_id": "YYYYMMDD_HHMMSS",
  "scheduled_at": "ISO8601"
}
```

## 5) Queue gating currently in scheduler

To be admitted into `jobs[]`, a candidate must pass all of:

- `confidence >= TREND_BUILD_QUEUE_MIN_CONFIDENCE` (default `0.62`)
- `trend_profile.trend_score >= TREND_BUILD_QUEUE_MIN_TREND_SCORE` (default `0.72`)
- `trend_profile.evidence_count >= TREND_BUILD_QUEUE_MIN_EVIDENCE` (default `10`)
- candidate cap `TREND_MAX_QUEUED_ITEMS` (default `24`)

Engine routing canonicalization:

- `claude` → `codex`
- `gpt` → `opus`
- defaults are:
  - `TREND_BUILD_TARGET_SKILL` (default `codex`)
  - `TREND_BUILD_TARGET_MCP` (default `minimax`)
  - `TREND_BUILD_TARGET_STARTUP` (default `opus`)

## 6) Upstream trend extraction controls (`spark-x-builder`)

Current defaults:

- `TREND_DAILY_ROW_BUDGET=180`
- `TREND_MAX_TOPIC_ROWS=36`
- `TREND_QUERY_LIMIT_HIGH=24`
- `TREND_QUERY_LIMIT_MEDIUM=18`
- `TREND_QUERY_LIMIT_LOW=12`
- `TREND_MIN_ENGAGEMENT_SCORE=45.0`
- `TREND_MIN_LIKES=4`
- `TREND_MIN_RETWEETS=1`
- `TREND_MIN_REPLIES=1`
- `TREND_MAX_FRESHNESS_HOURS=96`
- `TREND_MIN_CANDIDATE_BUCKET_SCORE=20`
- Viral filter defaults:
  - `TREND_VIRAL_MIN_SCORE=0.72`
  - `TREND_VIRAL_MIN_EVIDENCE=12`
  - `TREND_VIRAL_TOP_QUANTILE=0.10`
  - `TREND_VIRAL_MOMENTUM_MIN=1.40`
  - `TREND_VIRAL_ABSOLUTE_NEW=0.78`

## 7) Scheduler run behavior

`task_daily_research` in `spark_scheduler`:

1. Executes:
   - `spark-x-builder/scripts/daily_trend_research.py`
2. If exit non-zero: returns `{error, stderr, stdout}`.
3. If success:
   - writes `latest_trend_handoff.json`
   - emits queue manifest and writes `latest_build_queue.json`
   - appends one line JSON to `build_dispatch_log.jsonl`
4. Optional notify:
   - `TREND_NOTIFY_OPENCLAW` (default `1`)
   - `TREND_WAKE_OPENCLAW` (default `0`)

## 8) OpenClaw consumption contract

OpenClaw should:

1. Poll `latest_build_queue.json` on schedule or by wake signal.
2. For each `jobs[]` item:
   - de-duplicate by `job_id` and `run_id`
   - route by `assigned_engine`
   - create output in `target_path`
   - execute one-shot generation based on `one_shot_spawn`
3. Persist job status (`queued`, `running`, `done`, `failed`) with at least:
   - `job_id`, `run_id`, `assigned_engine`, `status`, `error`, `updated_at`
4. Emit completion event to a queue or logfile accessible to Spark.

## 9) Suggested OpenClaw implementation skeleton

- Manifest loader:
  - read JSON from `latest_build_queue.json`
- Dispatcher:
  - `codex` -> Codex tool runner
  - `minimax` -> Minimax tool runner
  - `opus` -> Opus tool runner
- Executor:
  - prefer idempotent runs
  - bounded retries with backoff
  - update status store for each job
- Recovery:
  - skip already-completed `job_id`
  - move terminal failures to dead-letter for manual review

## 10) Optional extensions (not yet built)

- Per-engine concurrency caps
- Cost + failure dashboards
- Result artifact indexes for “launched/not launched”
- Weekly topic-topic trending summary report

## 11) Reference docs

- `TREND_FLOW_SCHEMA.md` (full schema and examples)
- `SCHEDULER.md` (scheduler behavior/runbook)
- `X_PLAYBOOK.md` (manual/research operations)

