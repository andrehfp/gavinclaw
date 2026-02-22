#!/usr/bin/env python3
"""
Backfill trace_id bindings across EIDOS steps, evidence, and outcomes.

Usage:
    python scripts/trace_backfill.py
"""

from __future__ import annotations

import json
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.eidos import get_store, get_evidence_store  # noqa: E402
from lib.outcome_log import OUTCOMES_FILE, _ensure_trace_id  # noqa: E402


def backfill_outcomes() -> dict:
    if not OUTCOMES_FILE.exists():
        return {"outcomes_missing": 0, "outcomes_updated": 0}

    rows = []
    missing = 0
    updated = 0

    for line in OUTCOMES_FILE.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if not row.get("trace_id"):
            missing += 1
            _ensure_trace_id(row)
            if row.get("trace_id"):
                updated += 1
        rows.append(row)

    if updated:
        OUTCOMES_FILE.write_text(
            "\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n",
            encoding="utf-8",
        )

    return {"outcomes_missing": missing, "outcomes_updated": updated}


def main() -> int:
    store = get_store()
    evidence = get_evidence_store()

    step_stats = store.backfill_trace_ids(evidence_db_path=evidence.db_path)
    evidence_stats = evidence.backfill_trace_ids(steps_db_path=store.db_path)
    outcome_stats = backfill_outcomes()

    print("Trace backfill complete")
    print(f"  Steps missing:   {step_stats['steps_missing']} -> updated {step_stats['steps_updated']}")
    print(f"  Evidence missing:{evidence_stats['evidence_missing']} -> updated {evidence_stats['evidence_updated']}")
    print(f"  Outcomes missing:{outcome_stats['outcomes_missing']} -> updated {outcome_stats['outcomes_updated']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
