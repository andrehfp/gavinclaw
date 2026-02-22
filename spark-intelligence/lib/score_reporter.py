"""Reporting utilities for advisory auto-scoring."""

from __future__ import annotations

import json
import statistics
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List


def _infer_theme(item: Dict[str, Any]) -> str:
    tool = str(item.get("tool") or "").strip().lower()
    if tool:
        return f"tool:{tool}"
    text = str(item.get("recommendation") or "").lower()
    keyword_groups = {
        "testing": ("test", "pytest", "assert", "ci"),
        "reliability": ("retry", "timeout", "fail", "error", "stability"),
        "performance": ("latency", "slow", "perf", "memory", "cache"),
        "state": ("state", "transition", "constraint"),
        "security": ("auth", "token", "secret", "permission"),
    }
    for theme, kws in keyword_groups.items():
        if any(k in text for k in kws):
            return theme
    return "general"


def compute_kpis(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    total = len(items)
    acted = sum(1 for x in items if x.get("status") == "acted")
    skipped = sum(1 for x in items if x.get("status") == "skipped")
    unresolved = sum(1 for x in items if x.get("status") == "unresolved")
    positive = sum(1 for x in items if x.get("effect") == "positive")
    negative = sum(1 for x in items if x.get("effect") == "negative")

    latencies = [float(x["latency_s"]) for x in items if x.get("status") == "acted" and x.get("latency_s") is not None]
    median_latency = float(statistics.median(latencies)) if latencies else None

    ignored = [x for x in items if x.get("status") in {"skipped", "unresolved"}]
    theme_counts = Counter(_infer_theme(x) for x in ignored)
    top_ignored = [{"theme": k, "count": int(v)} for k, v in theme_counts.most_common(5)]

    return {
        "total_advisories": total,
        "acted": acted,
        "skipped": skipped,
        "unresolved": unresolved,
        "positive": positive,
        "negative": negative,
        "action_rate_pct": round((acted / total) * 100.0, 2) if total else 0.0,
        "helpful_rate_pct": round((positive / acted) * 100.0, 2) if acted else 0.0,
        "median_time_to_action_s": round(median_latency, 3) if median_latency is not None else None,
        "top_ignored_advisory_themes": top_ignored,
    }


def build_report(items: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "generated_at": time.time(),
        "kpis": compute_kpis(items),
        "items": items,
    }


def write_report(report: Dict[str, Any], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return output_path


def render_terminal_summary(report: Dict[str, Any]) -> str:
    k = report.get("kpis") or {}
    lines = [
        "Advice-to-Action Auto-Scorer",
        f"total={k.get('total_advisories', 0)} acted={k.get('acted', 0)} skipped={k.get('skipped', 0)} unresolved={k.get('unresolved', 0)}",
        f"action_rate={k.get('action_rate_pct', 0.0)}% helpful_rate={k.get('helpful_rate_pct', 0.0)}%",
    ]
    if k.get("median_time_to_action_s") is not None:
        lines.append(f"median_time_to_action={k.get('median_time_to_action_s')}s")
    top = k.get("top_ignored_advisory_themes") or []
    if top:
        formatted = ", ".join(f"{row['theme']}({row['count']})" for row in top[:5])
        lines.append(f"top_ignored_themes={formatted}")
    return "\n".join(lines)
