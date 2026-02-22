# Stage 9: Promotion

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[06-cognitive-learner|Cognitive Learner]] | [[08-advisory|Advisory]]
> Downstream: End of flow

**Purpose:** Promotes high-reliability insights (80%+ reliability, 5+ validations) to project files: CLAUDE.md, AGENTS.md, TOOLS.md, SOUL.md. Rate-limited to once per hour.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Total log entries | 0 | healthy |
| Log size | 0B | healthy |
| Last activity | never | healthy |
## Source Files

- `lib/promoter.py` — Core implementation
- `~/.spark/promotion_log.jsonl` — State storage
