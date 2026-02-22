# Stage 8: Advisory

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[06-cognitive-learner|Cognitive Learner]] | [[07-eidos|EIDOS]] | [[10-chips|Chips]]
> Downstream: [[09-promotion|Promotion]]

**Purpose:** Just-in-time advice engine. Retrieves from Cognitive, EIDOS, Chips, and Mind. RRF fusion + cross-encoder reranking. Tracks implicit feedback (tool success/failure after advice).
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Total advice given | 0 | healthy |
| Followed (effectiveness) | 0 (0.0%) | WARNING |
| Helpful | 0 | healthy |
| Decision emit rate | 0.0% | WARNING |
| Implicit follow rate | 0.0% | WARNING |
| Advice log entries | ~0 | healthy |
## Deep Dive

- [[../explore/decisions/_index|Advisory Decision Ledger]] — emit/suppress/block decisions
- [[../explore/feedback/_index|Implicit Feedback Loop]] — per-tool follow rates
- [[../explore/advisory/_index|Advisory Effectiveness]] — source breakdown + recent advice
- [[../explore/routing/_index|Retrieval Routing]] — route distribution and decisions

## Source Files

- `lib/advisor.py` — Core implementation
- `~/.spark/advisor/advice_log.jsonl` — State storage
- `~/.spark/advisor/effectiveness.json` — State storage
- `~/.spark/advisor/metrics.json` — State storage
- `~/.spark/advisor/implicit_feedback.jsonl` — State storage
- `~/.spark/advisor/retrieval_router.jsonl` — State storage
- `~/.spark/advisory_decision_ledger.jsonl` — State storage
