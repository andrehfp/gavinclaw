"""Spark Soul Upgrade integration helpers.

Lightweight bridge to consciousness state produced by Pulse/companion layer.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional
import json
import urllib.parse
import urllib.request


@dataclass
class SoulState:
    ok: bool
    mood: str = "builder"
    mission_anchor: str = ""
    soul_kernel: Optional[Dict[str, Any]] = None
    source: str = "fallback"


def fetch_soul_state(session_id: str = "default", base_url: str = "http://127.0.0.1:8765") -> SoulState:
    query = urllib.parse.urlencode({"session_id": session_id})
    url = f"{base_url.rstrip('/')}/api/companion/consciousness?{query}"
    try:
        with urllib.request.urlopen(url, timeout=1.5) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception:
        return SoulState(ok=False, source="fallback")

    return SoulState(
        ok=bool(payload.get("ok")),
        mood=str(payload.get("mood") or "builder"),
        mission_anchor=str(payload.get("mission_anchor") or ""),
        soul_kernel=payload.get("soul_kernel") if isinstance(payload.get("soul_kernel"), dict) else None,
        source="pulse-companion",
    )


def soul_kernel_pass(state: SoulState) -> bool:
    k = state.soul_kernel or {}
    return bool(k.get("non_harm") and k.get("service") and k.get("clarity"))


def guidance_preface(state: SoulState) -> str:
    if not state.ok:
        return ""
    mood = state.mood.lower().strip()
    if mood == "zen":
        return "Respond calmly and keep guidance grounding-first."
    if mood == "oracle":
        return "Respond insightfully with concise practical signal."
    if mood == "chaos":
        return "Respond playfully but keep guidance safe and coherent."
    return "Respond direct and action-first."
