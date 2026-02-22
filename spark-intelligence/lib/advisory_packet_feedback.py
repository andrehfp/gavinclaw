"""
Feedback and outcome recording for advisory packets.

Extracted from advisory_packet_store.py (2026-02-22) to reduce monolith size.
Records explicit feedback (helpful/unhelpful/noisy) and implicit outcomes
(acted/blocked/harmful/ignored) on packets.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


def record_packet_feedback(
    packet_id: str,
    *,
    helpful: Optional[bool],
    noisy: bool = False,
    followed: bool = True,
    source: str = "explicit",
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Record explicit feedback on a packet."""
    from .advisory_packet_store import (
        get_packet,
        save_packet,
        _normalize_packet,
        _normalize_trace_usage_history,
        _now,
        TRACE_EVENT_HISTORY_MAX,
    )

    packet = get_packet(packet_id)
    if not packet:
        return {"ok": False, "reason": "packet_not_found", "packet_id": packet_id}

    packet["feedback_count"] = int(packet.get("feedback_count", 0) or 0) + 1
    if helpful is True:
        packet["helpful_count"] = int(packet.get("helpful_count", 0) or 0) + 1
    elif helpful is False:
        packet["unhelpful_count"] = int(packet.get("unhelpful_count", 0) or 0) + 1
    if noisy:
        packet["noisy_count"] = int(packet.get("noisy_count", 0) or 0) + 1

    feedback_ts = _now()
    if trace_id or packet.get("last_trace_id"):
        resolved_trace = str(trace_id or packet.get("last_trace_id") or "").strip()
        if resolved_trace:
            feedback_history = packet.get("trace_usage_history") or []
            feedback_history.append(
                {
                    "ts": feedback_ts,
                    "trace_id": resolved_trace,
                    "tool_name": str(packet.get("tool_name") or "").strip(),
                    "route": "feedback",
                    "event": f"feedback:{'helpful' if helpful is True else 'unhelpful' if helpful is False else 'unknown'}",
                    "source": str(source or "").strip(),
                    "route_order": len(feedback_history) + 1,
                    "emitted": False,
                }
            )
            packet["trace_usage_history"] = _normalize_trace_usage_history(
                feedback_history,
                limit=TRACE_EVENT_HISTORY_MAX,
            )
            packet["last_trace_id"] = resolved_trace

    packet["last_feedback"] = {
        "helpful": helpful,
        "noisy": bool(noisy),
        "followed": bool(followed),
        "source": str(source or "")[:80],
        "ts": feedback_ts,
    }
    packet = _normalize_packet(packet)
    save_packet(packet)
    return {
        "ok": True,
        "packet_id": packet_id,
        "effectiveness_score": float(packet.get("effectiveness_score", 0.5) or 0.5),
        "feedback_count": int(packet.get("feedback_count", 0) or 0),
    }


def record_packet_outcome(
    packet_id: str,
    *,
    status: str,
    source: str = "implicit",
    tool_name: Optional[str] = None,
    trace_id: Optional[str] = None,
    notes: str = "",
    count_effectiveness: bool = True,
) -> Dict[str, Any]:
    """Record an outcome tag for a packet.

    Status taxonomy:
    - acted: advice was acted on and the step succeeded
    - blocked: advice was acted on but the step failed/blocked
    - harmful: advice was followed and led to a bad outcome
    - ignored: advice was shown but not acted on
    """
    from .advisory_packet_store import (
        get_packet,
        save_packet,
        _normalize_packet,
        _normalize_trace_usage_history,
        _now,
        TRACE_EVENT_HISTORY_MAX,
    )

    packet = get_packet(packet_id)
    if not packet:
        return {"ok": False, "reason": "packet_not_found", "packet_id": packet_id}

    st = str(status or "").strip().lower()
    if st not in {"acted", "blocked", "harmful", "ignored"}:
        return {"ok": False, "reason": "invalid_status", "status": st, "packet_id": packet_id}

    if st == "acted":
        packet["acted_count"] = int(packet.get("acted_count", 0) or 0) + 1
    elif st == "blocked":
        packet["blocked_count"] = int(packet.get("blocked_count", 0) or 0) + 1
    elif st == "harmful":
        packet["harmful_count"] = int(packet.get("harmful_count", 0) or 0) + 1
    elif st == "ignored":
        packet["ignored_count"] = int(packet.get("ignored_count", 0) or 0) + 1
    outcome_ts = _now()
    if trace_id:
        outcome_history = packet.get("trace_usage_history") or []
        outcome_history.append(
            {
                "ts": outcome_ts,
                "trace_id": str(trace_id or "").strip(),
                "tool_name": str(tool_name or "").strip(),
                "route": "outcome",
                "event": f"outcome:{st}",
                "source": str(source or "").strip(),
                "emitted": False,
                "route_order": len(outcome_history) + 1,
            }
        )
        packet["last_trace_id"] = str(trace_id or "").strip()
        packet["trace_usage_history"] = _normalize_trace_usage_history(
            outcome_history,
            limit=TRACE_EVENT_HISTORY_MAX,
        )

    if count_effectiveness:
        if st == "acted":
            packet["helpful_count"] = int(packet.get("helpful_count", 0) or 0) + 1
        elif st in {"blocked", "harmful"}:
            packet["unhelpful_count"] = int(packet.get("unhelpful_count", 0) or 0) + 1

    packet["last_outcome"] = {
        "status": st,
        "source": str(source or "")[:80],
        "tool": str(tool_name or "")[:40] if tool_name else "",
        "trace_id": str(trace_id or "")[:120] if trace_id else "",
        "notes": str(notes or "")[:200] if notes else "",
        "ts": outcome_ts,
    }
    packet = _normalize_packet(packet)
    save_packet(packet)
    return {
        "ok": True,
        "packet_id": packet_id,
        "status": st,
        "effectiveness_score": float(packet.get("effectiveness_score", 0.5) or 0.5),
        "acted_count": int(packet.get("acted_count", 0) or 0),
        "blocked_count": int(packet.get("blocked_count", 0) or 0),
        "harmful_count": int(packet.get("harmful_count", 0) or 0),
        "ignored_count": int(packet.get("ignored_count", 0) or 0),
    }


def record_packet_outcome_for_advice(
    advice_id: str,
    *,
    status: str,
    source: str = "explicit",
    tool_name: Optional[str] = None,
    trace_id: Optional[str] = None,
    notes: str = "",
    count_effectiveness: bool = True,
) -> Dict[str, Any]:
    """Find the newest packet containing advice_id and record an outcome tag."""
    from .advisory_packet_store import _load_index, get_packet

    advice = str(advice_id or "").strip()
    if not advice:
        return {"ok": False, "reason": "missing_advice_id"}

    index = _load_index()
    meta = index.get("packet_meta") or {}
    ordered_ids = sorted(
        meta.keys(),
        key=lambda pid: float((meta.get(pid) or {}).get("updated_ts", 0.0)),
        reverse=True,
    )
    for packet_id in ordered_ids:
        packet = get_packet(packet_id)
        if not packet:
            continue
        advice_rows = packet.get("advice_items") or []
        for row in advice_rows:
            if str((row or {}).get("advice_id") or "").strip() == advice:
                result = record_packet_outcome(
                    packet_id,
                    status=status,
                    source=source,
                    tool_name=tool_name,
                    trace_id=trace_id,
                    notes=notes,
                    count_effectiveness=count_effectiveness,
                )
                result["matched_advice_id"] = advice
                return result
    return {"ok": False, "reason": "packet_not_found_for_advice", "advice_id": advice}


def record_packet_feedback_for_advice(
    advice_id: str,
    *,
    helpful: Optional[bool],
    noisy: bool = False,
    followed: bool = True,
    source: str = "explicit",
    trace_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Find the newest packet containing advice_id and record feedback."""
    from .advisory_packet_store import _load_index, get_packet

    advice = str(advice_id or "").strip()
    if not advice:
        return {"ok": False, "reason": "missing_advice_id"}

    index = _load_index()
    meta = index.get("packet_meta") or {}
    ordered_ids = sorted(
        meta.keys(),
        key=lambda pid: float((meta.get(pid) or {}).get("updated_ts", 0.0)),
        reverse=True,
    )
    for packet_id in ordered_ids:
        packet = get_packet(packet_id)
        if not packet:
            continue
        advice_rows = packet.get("advice_items") or []
        for row in advice_rows:
            if str((row or {}).get("advice_id") or "").strip() == advice:
                result = record_packet_feedback(
                    packet_id,
                    helpful=helpful,
                    noisy=noisy,
                    followed=followed,
                    source=source,
                    trace_id=trace_id,
                )
                result["matched_advice_id"] = advice
                return result
    return {"ok": False, "reason": "packet_not_found_for_advice", "advice_id": advice}
