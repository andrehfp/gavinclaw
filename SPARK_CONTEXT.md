==================================================
  SPARK ACTIVE CONTEXT
  Learnings that should influence behavior
==================================================

## Project Focus
- Phase: discovery

## Project Questions
- What architecture decision matters most?
- What will cause problems later if ignored?
- What signals completion beyond tests passing?

==================================================

<!-- SPARK:BEGIN -->
## Spark Bootstrap
Auto-loaded high-confidence learnings from ~/.spark/cognitive_insights.json
Last updated: 2026-02-25T23:49:44

No validated insights yet.

## ⚡ Latest Activity
Last cycle: 1m ago

## 💬 How to Self-Report

Write a JSON file to `~/.openclaw/workspace/spark_reports/` and Spark picks it up automatically.

**Quick ref** (use the `write` tool):
```json
{"kind": "decision", "intent": "...", "reasoning": "...", "confidence": 0.9}
{"kind": "outcome", "result": "...", "lesson": "..."}
{"kind": "preference", "liked": "...", "disliked": "..."}
```

Or if `lib/self_report.py` is importable:
```python
from lib.self_report import report
report("decision", intent="use caching", reasoning="reduce latency", confidence=0.85)
```
<!-- SPARK:END -->