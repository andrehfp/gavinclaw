#!/usr/bin/env python3
"""trace_query - minimal trace timeline lookup.

Usage:
  python scripts/trace_query.py --trace-id <trace_id>
"""

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from lib.eidos import get_store, get_evidence_store  # noqa: E402


OUTCOMES_FILE = Path.home() / ".spark" / "outcomes.jsonl"


def _read_jsonl(path: Path, limit: int = 400):
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []
    rows = []
    for line in lines[-limit:]:
        try:
            rows.append(json.loads(line))
        except Exception:
            continue
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trace-id", required=True, help="trace_id to query")
    args = ap.parse_args()

    trace_id = args.trace_id.strip()
    if not trace_id:
        print("trace_id required", file=sys.stderr)
        return 1

    store = get_store()
    steps = []
    try:
        with sqlite3.connect(store.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM steps WHERE trace_id = ? ORDER BY created_at",
                (trace_id,),
            ).fetchall()
        steps = [store._row_to_step(r) for r in rows]
    except Exception:
        steps = []

    episodes = []
    episode_ids = sorted({s.episode_id for s in steps if s.episode_id})
    for ep_id in episode_ids:
        ep = store.get_episode(ep_id)
        if not ep:
            continue
        episodes.append({
            "episode_id": ep.episode_id,
            "goal": ep.goal,
            "phase": ep.phase.value,
            "outcome": ep.outcome.value,
            "step_count": ep.step_count,
            "start_ts": ep.start_ts,
            "end_ts": ep.end_ts,
        })

    evidence_rows = []
    try:
        ev_store = get_evidence_store()
        for step in steps:
            for ev in ev_store.get_for_step(step.step_id):
                evidence_rows.append({
                    "evidence_id": ev.evidence_id,
                    "step_id": ev.step_id,
                    "trace_id": ev.trace_id,
                    "type": ev.type.value if hasattr(ev.type, "value") else str(ev.type),
                    "tool": ev.tool_name,
                    "created_at": ev.created_at,
                    "expires_at": ev.expires_at,
                    "bytes": ev.byte_size,
                })
    except Exception:
        pass

    outcomes = []
    for row in _read_jsonl(OUTCOMES_FILE, limit=600):
        if row.get("trace_id") != trace_id:
            continue
        outcomes.append({
            "outcome_id": row.get("outcome_id"),
            "event_type": row.get("event_type"),
            "tool": row.get("tool"),
            "polarity": row.get("polarity"),
            "text": (row.get("text") or "")[:160],
            "created_at": row.get("created_at"),
        })

    payload = {
        "trace_id": trace_id,
        "episodes": episodes,
        "steps": [
            {
                "step_id": s.step_id,
                "episode_id": s.episode_id,
                "intent": (s.intent or "")[:80],
                "decision": (s.decision or "")[:80],
                "tool": (s.action_details or {}).get("tool"),
                "evaluation": s.evaluation.value if hasattr(s.evaluation, "value") else str(s.evaluation),
                "validated": bool(s.validated),
                "created_at": s.created_at,
                "result": (s.result or "")[:160],
            }
            for s in steps
        ],
        "evidence": evidence_rows,
        "outcomes": outcomes,
    }

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
