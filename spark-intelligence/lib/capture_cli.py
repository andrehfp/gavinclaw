"""CLI helpers for memory capture.

Kept separate to avoid bloating cli.py with formatting.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List


def _ago(ts: float) -> str:
    if not ts:
        return "?"
    s = max(0, int(time.time() - ts))
    if s < 60:
        return f"{s}s"
    if s < 3600:
        return f"{s//60}m"
    return f"{s//3600}h"


def format_pending(items: List[Dict[str, Any]]) -> str:
    if not items:
        return "No pending suggestions."

    lines = [f"Pending suggestions: {len(items)}\n"]
    for it in items:
        sid = it.get("suggestion_id")
        score = it.get("score")
        cat = it.get("category")
        created = _ago(float(it.get("created_at") or 0))
        text = (it.get("text") or "").strip().replace("\n", " ")
        if len(text) > 140:
            text = text[:140] + "…"
        lines.append(f"- {sid}  score={score:.2f}  [{cat}]  {created} ago")
        lines.append(f"  {text}")
    return "\n".join(lines)
