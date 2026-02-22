"""Evaluate advisory effect using deterministic rules + optional MiniMax."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Optional

try:
    import httpx as _httpx
except Exception:
    _httpx = None

_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.IGNORECASE | re.DOTALL)


def _strip_think(text: str) -> str:
    return _THINK_TAG_RE.sub("", str(text or "")).strip()


def _extract_json_obj(text: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None


def _minimax_effect(
    recommendation: str,
    evidence_excerpt: str,
    status: str,
) -> Optional[Dict[str, Any]]:
    api_key = os.getenv("MINIMAX_API_KEY") or os.getenv("SPARK_MINIMAX_API_KEY")
    if not api_key or _httpx is None:
        return None
    base = os.getenv("SPARK_MINIMAX_BASE_URL", "https://api.minimax.io/v1").rstrip("/")
    model = os.getenv("SPARK_MINIMAX_MODEL", "MiniMax-M2.5")
    timeout_s = float(os.getenv("AUTO_SCORER_MINIMAX_TIMEOUT_S", "15"))  # M2.5 thinking can take 5-15s
    prompt = (
        "Classify advisory outcome effect using strict JSON only.\n"
        f"status={status}\n"
        f"recommendation={recommendation[:500]}\n"
        f"evidence={evidence_excerpt[:800]}\n"
        "Return JSON object with keys: effect (positive|neutral|negative), confidence (0..1), reason."
    )
    try:
        with _httpx.Client(timeout=timeout_s) as client:
            resp = client.post(
                f"{base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1500,  # M2.5 thinking needs ~1000 tokens before response
                    "temperature": 0.1,
                },
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                return None
            content = _strip_think(str(choices[0].get("message", {}).get("content", "")))
            parsed = _extract_json_obj(content)
            if not parsed:
                return None
            effect = str(parsed.get("effect") or "").lower().strip()
            if effect not in {"positive", "neutral", "negative"}:
                return None
            try:
                confidence = max(0.0, min(1.0, float(parsed.get("confidence"))))
            except Exception:
                confidence = 0.5
            return {
                "effect": effect,
                "confidence": confidence,
                "reason": str(parsed.get("reason") or "")[:240],
            }
    except Exception:
        return None


def evaluate_effect(
    advisory: Dict[str, Any],
    match: Dict[str, Any],
    *,
    use_minimax: bool = False,
) -> Dict[str, Any]:
    status = str(match.get("status") or "unresolved")
    hint = str(match.get("effect_hint") or "neutral")
    confidence = float(match.get("confidence_hint") or 0.35)
    evidence_excerpt = str(match.get("evidence_excerpt") or "")

    if status == "skipped":
        return {
            "effect": "neutral",
            "confidence": max(confidence, 0.75),
            "reason": "advisory_skipped",
        }
    if status == "unresolved":
        return {
            "effect": "neutral",
            "confidence": min(confidence, 0.45),
            "reason": "no_action_evidence",
        }

    if hint in {"positive", "negative", "neutral"}:
        if hint != "neutral":
            confidence = max(confidence, 0.8)
        return {
            "effect": hint,
            "confidence": max(0.0, min(1.0, confidence)),
            "reason": f"match_{match.get('match_type')}",
        }

    if use_minimax:
        inferred = _minimax_effect(
            recommendation=str(advisory.get("recommendation") or ""),
            evidence_excerpt=evidence_excerpt,
            status=status,
        )
        if inferred:
            return inferred

    return {
        "effect": "neutral",
        "confidence": min(0.6, confidence),
        "reason": "default_neutral",
    }
