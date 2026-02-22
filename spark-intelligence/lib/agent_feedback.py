"""Agent-side feedback helpers for OpenClaw workspace.

These functions are designed to be called by the agent (Spark the Seer)
from within the OpenClaw session to report feedback on advisories,
decisions, and outcomes.

The agent should call these after reading SPARK_ADVISORY.md to close
the feedback loop.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Optional

REPORTS_DIR = Path.home() / ".openclaw" / "workspace" / "spark_reports"


def _write_report(kind: str, **kwargs) -> Path:
    """Write a structured report file."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.time()
    ts_str = time.strftime("%Y%m%d_%H%M%S", time.localtime(ts))
    uid = uuid.uuid4().hex[:6]
    filename = f"{kind}_{ts_str}_{uid}.json"
    path = REPORTS_DIR / filename
    payload = {"kind": kind, "ts": ts, **kwargs}
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path


def advisory_acted(recommendation: str, outcome: str, success: bool = True) -> Path:
    """Report that an advisory recommendation was acted on.

    Args:
        recommendation: The advisory text that was followed
        outcome: What happened when it was applied
        success: Whether it worked

    Example:
        advisory_acted(
            "Disable fastembed to prevent memory leak",
            "Set SPARK_EMBEDDINGS=0, RAM dropped from 8GB to 68MB",
            success=True
        )
    """
    return _write_report(
        "outcome",
        result=outcome,
        lesson=f"Applied advisory: {recommendation}",
        success=success,
        advisory_ref=recommendation[:200],
        source="spark_advisory",
    )


def advisory_skipped(recommendation: str, reason: str = "") -> Path:
    """Report that an advisory recommendation was deliberately skipped.

    Args:
        recommendation: The advisory text that was skipped
        reason: Why it was skipped
    """
    return _write_report(
        "decision",
        intent="Skipped advisory recommendation",
        reasoning=reason or f"Did not act on: {recommendation}",
        confidence=0.5,
        source="spark_advisory",
    )


def learned_something(lesson: str, context: str = "", confidence: float = 0.8) -> Path:
    """Report a lesson learned during the session.

    Args:
        lesson: What was learned
        context: How/where it was learned
        confidence: How confident in this lesson (0-1)

    Example:
        learned_something(
            "PowerShell Invoke-WebRequest chokes on responses >400KB",
            "Discovered while debugging Spark Pulse dashboard",
            confidence=0.95
        )
    """
    return _write_report(
        "outcome",
        result=context or "Session learning",
        lesson=lesson,
        success=True,
        source="agent_session",
    )


def preference(liked: str = "", disliked: str = "") -> Path:
    """Report a preference about how things should work.

    Example:
        preference(
            liked="Direct API calls over CLI wrappers",
            disliked="Spawning console windows for simple HTTP calls"
        )
    """
    return _write_report(
        "preference",
        liked=liked,
        disliked=disliked,
        source="agent_preference",
    )


def decision_made(intent: str, reasoning: str, confidence: float = 0.7) -> Path:
    """Report a significant decision made during the session.

    Example:
        decision_made(
            "Use 2MB chip rotation threshold instead of 10MB",
            "44MB total was excessive, causing slow file reads",
            confidence=0.9
        )
    """
    return _write_report(
        "decision",
        intent=intent,
        reasoning=reasoning,
        confidence=confidence,
        source="agent_decision",
    )
