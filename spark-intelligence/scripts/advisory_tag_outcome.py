#!/usr/bin/env python3
"""
Tag advisory outcomes (acted/blocked/harmful/ignored) against the most recent
advice request for a tool or a specific advice_id.

This is intentionally lightweight: it writes a feedback row and updates packet
outcome counters so the system can evolve on measurable tags.
"""

from __future__ import annotations

import argparse
from typing import Any, Dict, List, Optional


def _pick_latest_request_for_tool(tool: str) -> Optional[Dict[str, Any]]:
    from lib.advice_feedback import list_requests

    rows = list_requests(limit=50, max_age_s=None)
    want = (tool or "").strip().lower()
    for row in rows:
        if str(row.get("tool") or "").strip().lower() == want:
            return row
    return None


def _derive_helpful_followed(status: str) -> tuple[Optional[bool], bool, str]:
    st = (status or "").strip().lower()
    if st == "acted":
        return True, True, "good"
    if st == "blocked":
        return False, True, "bad"
    if st == "harmful":
        return False, True, "bad"
    if st == "ignored":
        return None, False, "neutral"
    return None, False, "neutral"


def main() -> int:
    ap = argparse.ArgumentParser(description="Tag advisory outcome for a tool or advice id.")
    ap.add_argument("--tool", default="", help="Tool name (e.g. Read/Edit/Bash/WebFetch/Task)")
    ap.add_argument("--advice-id", default="", help="Specific advice_id to tag")
    ap.add_argument(
        "--status",
        required=True,
        choices=["acted", "blocked", "harmful", "ignored"],
        help="Outcome tag to record",
    )
    ap.add_argument("--notes", default="", help="Short notes (optional)")
    ap.add_argument(
        "--no-count-effectiveness",
        action="store_true",
        help="Do not adjust helpful/unhelpful counters when recording packet outcome",
    )
    args = ap.parse_args()

    status = str(args.status or "").strip().lower()
    advice_id = str(args.advice_id or "").strip()
    tool = str(args.tool or "").strip()
    notes = str(args.notes or "").strip()
    count_effectiveness = not bool(args.no_count_effectiveness)

    helpful, followed, outcome = _derive_helpful_followed(status)

    from lib.advice_feedback import record_feedback
    from lib.advisory_packet_store import record_packet_outcome_for_advice

    if advice_id:
        ok = record_feedback(
            advice_ids=[advice_id],
            tool=(tool or None),
            helpful=helpful,
            followed=followed,
            status=status,
            outcome=outcome,
            notes=notes,
            source="tag_cli",
        )
        pkt = record_packet_outcome_for_advice(
            advice_id,
            status=status,
            source="tag_cli",
            tool_name=(tool or None),
            notes=notes,
            count_effectiveness=count_effectiveness,
        )
        print({"feedback_ok": ok, "packet": pkt})
        return 0 if ok else 2

    if not tool:
        raise SystemExit("Provide --tool or --advice-id")

    req = _pick_latest_request_for_tool(tool)
    if not req:
        print({"status": "not_found", "message": "No recent advice request for tool", "tool": tool})
        return 2

    advice_ids: List[str] = [str(x) for x in (req.get("advice_ids") or []) if str(x).strip()]
    if not advice_ids:
        print({"status": "not_found", "message": "Request has no advice_ids", "tool": tool})
        return 2

    trace_id = req.get("trace_id")
    run_id = req.get("run_id")
    session_id = req.get("session_id")
    packet_id = req.get("packet_id")
    route = req.get("route")
    ok = record_feedback(
        advice_ids=advice_ids,
        tool=tool,
        helpful=helpful,
        followed=followed,
        status=status,
        outcome=outcome,
        trace_id=(str(trace_id) if trace_id else None),
        run_id=(str(run_id) if run_id else None),
        session_id=(str(session_id) if session_id else None),
        packet_id=(str(packet_id) if packet_id else None),
        route=(str(route) if route else None),
        notes=notes,
        source="tag_cli",
    )

    packets = []
    for aid in advice_ids:
        packets.append(
            record_packet_outcome_for_advice(
                aid,
                status=status,
                source="tag_cli",
                tool_name=tool,
                trace_id=(str(trace_id) if trace_id else None),
                notes=notes,
                count_effectiveness=count_effectiveness,
            )
        )
    print({"feedback_ok": ok, "tool": tool, "advice_ids": advice_ids, "packets": packets})
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

