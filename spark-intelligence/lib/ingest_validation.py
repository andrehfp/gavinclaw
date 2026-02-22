"""Lightweight ingest validation utilities for Spark queue events."""

from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Any, Dict

from lib.queue import EVENTS_FILE, EventType
from lib.diagnostics import log_debug

REPORT_FILE = Path.home() / ".spark" / "ingest_report.json"


def _tail_lines(path: Path, limit: int) -> deque:
    lines: deque = deque(maxlen=limit)
    try:
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                lines.append(line)
    except Exception as e:
        log_debug("ingest_validation", "tail_lines failed", e)
    return lines


def _validate_event_row(row: Dict[str, Any]) -> str:
    if not isinstance(row, dict):
        return "not_object"
    if "event_type" not in row:
        return "missing_event_type"
    try:
        EventType(row.get("event_type"))
    except Exception:
        return "invalid_event_type"
    session_id = row.get("session_id")
    if not isinstance(session_id, str) or not session_id.strip():
        return "invalid_session_id"
    try:
        ts = float(row.get("timestamp") or 0)
        if ts <= 0:
            return "invalid_timestamp"
    except Exception:
        return "invalid_timestamp"
    data = row.get("data")
    if data is None or not isinstance(data, dict):
        return "invalid_data"
    if "tool_input" in row and row["tool_input"] is not None and not isinstance(row["tool_input"], dict):
        return "invalid_tool_input"
    if "tool_name" in row and row["tool_name"] is not None and not isinstance(row["tool_name"], str):
        return "invalid_tool_name"
    return ""


def scan_queue_events(*, limit: int = 500) -> Dict[str, Any]:
    """Scan recent queue events and report schema issues."""
    stats: Dict[str, Any] = {
        "checked_at": None,
        "window": limit,
        "processed": 0,
        "valid": 0,
        "invalid": 0,
        "reasons": {},
    }
    if not EVENTS_FILE.exists():
        return stats

    lines = _tail_lines(EVENTS_FILE, limit)
    stats["checked_at"] = __import__("time").time()
    for line in lines:
        stats["processed"] += 1
        try:
            row = json.loads(line.strip())
        except Exception:
            stats["invalid"] += 1
            stats["reasons"]["invalid_json"] = stats["reasons"].get("invalid_json", 0) + 1
            continue
        reason = _validate_event_row(row)
        if reason:
            stats["invalid"] += 1
            stats["reasons"][reason] = stats["reasons"].get(reason, 0) + 1
            continue
        stats["valid"] += 1

    return stats


def write_ingest_report(stats: Dict[str, Any], path: Path = REPORT_FILE) -> None:
    """Write the latest ingest validation report to disk."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(stats, indent=2), encoding="utf-8")
    except Exception as e:
        log_debug("ingest_validation", "write_report failed", e)
