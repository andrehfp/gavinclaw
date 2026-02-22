"""Outcome check-in request helpers."""

from __future__ import annotations

import json
import time
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional

from lib.diagnostics import log_debug


CHECKIN_FILE = Path.home() / ".spark" / "outcome_requests.jsonl"
STATE_FILE = Path.home() / ".spark" / "outcome_checkin_state.json"


def _load_state() -> Dict[str, Any]:
    if not STATE_FILE.exists():
        return {}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_state(state: Dict[str, Any]) -> None:
    try:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")
    except Exception as e:
        log_debug("outcome_checkin", "save_state failed", e)


def record_checkin_request(
    *,
    session_id: str,
    event: str,
    reason: str = "",
    min_interval_s: int = 1800,
) -> bool:
    """Record a check-in request, rate-limited by min_interval_s."""
    try:
        now = time.time()
        state = _load_state()
        last = float(state.get("last_ts") or 0.0)
        if now - last < min_interval_s:
            return False

        CHECKIN_FILE.parent.mkdir(parents=True, exist_ok=True)
        row = {
            "session_id": session_id,
            "event": event,
            "reason": reason,
            "created_at": now,
        }
        with CHECKIN_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

        state["last_ts"] = now
        _save_state(state)
        return True
    except Exception as e:
        log_debug("outcome_checkin", "record_checkin_request failed", e)
        return False


def list_checkins(limit: int = 10) -> List[Dict[str, Any]]:
    if not CHECKIN_FILE.exists():
        return []
    lines: deque = deque(maxlen=limit)
    try:
        with CHECKIN_FILE.open("r", encoding="utf-8") as f:
            for line in f:
                lines.append(line)
    except Exception as e:
        log_debug("outcome_checkin", "list_checkins failed", e)
        return []

    out: List[Dict[str, Any]] = []
    for line in reversed(lines):
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out
