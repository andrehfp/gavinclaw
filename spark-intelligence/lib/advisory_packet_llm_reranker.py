"""
LLM-based reranking for advisory packet lookup candidates.

Extracted from advisory_packet_store.py (2026-02-22) to reduce monolith size.
Optional: only active when PACKET_LOOKUP_LLM_ENABLED=True and httpx is available.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

try:
    import httpx as _HTTPX
except Exception:
    _HTTPX = None

# ── LLM reranking config (mirrored from parent defaults) ──────────────
PACKET_LOOKUP_LLM_ENABLED = False
PACKET_LOOKUP_LLM_PROVIDER = "minimax"
PACKET_LOOKUP_LLM_TIMEOUT_S = 1.2
PACKET_LOOKUP_LLM_TOP_K = 3
PACKET_LOOKUP_LLM_MIN_CANDIDATES = 2
PACKET_LOOKUP_LLM_CONTEXT_CHARS = 220
PACKET_LOOKUP_LLM_URL = "https://api.minimax.io/v1"
PACKET_LOOKUP_LLM_MODEL = "MiniMax-M2.5"
PACKET_LOOKUP_LLM_FALLBACK_TO_SCORING = True


def _sanitize_lookup_provider(raw: Any) -> str:
    provider = str(raw or "").strip().lower()
    if not provider:
        return PACKET_LOOKUP_LLM_PROVIDER
    if provider in {"minimax", "openai", "ollama", "anthropic", "gemini"}:
        return provider
    return PACKET_LOOKUP_LLM_PROVIDER


def _build_lookup_payload(
    packet_candidates: List[Dict[str, Any]],
    context_text: str,
    top_k: int,
) -> str:
    prompt_lines = [
        "You are a strict ranker for advisory packet retrieval.",
        "Return exactly one JSON array of packet_id strings in descending relevance order.",
        "Only include packet_ids from the provided candidate list.",
        f"Select at most {top_k} packet_ids.",
        "Prefer packets with higher expected usefulness for the immediate user intent.",
    ]
    context = str(context_text or "").strip().replace("\n", " ")
    if context:
        prompt_lines.append(f'Context: "{context}"')
    prompt_lines.append("Candidates (packet_id, score, tool_name, intent_family, task_plane, advisory_preview):")
    for row in packet_candidates[:top_k]:
        prompt_lines.append(json.dumps({
            "packet_id": str(row.get("packet_id") or ""),
            "score": float(row.get("score", 0.0) or 0.0),
            "tool_name": str(row.get("tool_name") or ""),
            "intent_family": str(row.get("intent_family") or ""),
            "task_plane": str(row.get("task_plane") or ""),
            "effectiveness_score": float(row.get("effectiveness_score", 0.0) or 0.0),
            "advisory_text_preview": str(row.get("advisory_text_preview") or ""),
        }, ensure_ascii=False, separators=(",", ":")))
    prompt_lines.append('Return only JSON. No markdown. Example: ["pkt_abc", "pkt_def"]')
    return "\n".join(prompt_lines)


def _extract_json_like_array(raw: str) -> List[str]:
    if not raw:
        return []
    text = str(raw).strip()
    try:
        parsed = json.loads(text)
    except Exception:
        # Try extracting first JSON-like list from markdown-wrapped output.
        match = re.search(r"\[[^\r\n]*\]", text, re.DOTALL)
        if not match:
            return []
        try:
            parsed = json.loads(match.group(0))
        except Exception:
            return []
    if isinstance(parsed, dict):
        parsed_list: Optional[List[Any]] = None
        for k in ("packet_ids", "reranked_ids", "result", "ids"):
            candidate = parsed.get(k)
            if isinstance(candidate, list):
                parsed_list = candidate
                break
        parsed = parsed_list if parsed_list is not None else []
    if not isinstance(parsed, list):
        return []
    out: List[str] = []
    for value in parsed:
        packet_id = str(value or "").strip()
        if packet_id:
            out.append(packet_id)
    return out


def _lookup_llm_api_key(provider: str) -> Optional[str]:
    p = str(provider or "").strip().lower()
    if p == "minimax":
        return (
            os.getenv("SPARK_MINIMAX_API_KEY")
            or os.getenv("MINIMAX_API_KEY")
            or os.getenv("SPARK_MINIMAX_TOKEN")
        )
    if p == "openai":
        return os.getenv("OPENAI_API_KEY") or os.getenv("SPARK_OPENAI_API_KEY")
    if p == "anthropic":
        return (
            os.getenv("ANTHROPIC_API_KEY")
            or os.getenv("SPARK_ANTHROPIC_API_KEY")
            or os.getenv("CLAUDE_API_KEY")
        )
    if p == "gemini":
        return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return None


def _lookup_llm_url(provider: str) -> str:
    p = str(provider or "").strip().lower()
    if p == "ollama":
        return str(os.getenv("SPARK_OLLAMA_API", "http://localhost:11434")).rstrip("/")
    if p == "minimax":
        return str(os.getenv("SPARK_MINIMAX_BASE_URL", PACKET_LOOKUP_LLM_URL)).rstrip("/")
    if p == "openai":
        return str(os.getenv("SPARK_OPENAI_BASE_URL", "https://api.openai.com")).rstrip("/")
    if p == "anthropic":
        return str(os.getenv("SPARK_ANTHROPIC_BASE_URL", "https://api.anthropic.com")).rstrip("/")
    if p == "gemini":
        return str(os.getenv("SPARK_GEMINI_BASE_URL", "https://generativelanguage.googleapis.com")).rstrip("/")
    return str(PACKET_LOOKUP_LLM_URL).rstrip("/")


def _call_lookup_llm(
    prompt: str,
    *,
    provider: str,
    timeout_s: float,
) -> Optional[str]:
    if _HTTPX is None:
        return None
    provider = str(provider or "").strip().lower()
    base_url = _lookup_llm_url(provider)
    if provider == "ollama":
        request_url = f"{base_url}/api/chat"
        payload = {
            "model": PACKET_LOOKUP_LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "options": {"temperature": 0.0},
        }
        headers: Dict[str, str] = {"Content-Type": "application/json"}
    else:
        if provider == "minimax":
            request_url = f"{base_url}/chat/completions"
        else:
            request_url = f"{base_url}/v1/chat/completions"
        api_key = _lookup_llm_api_key(provider)
        if not api_key:
            return None
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": PACKET_LOOKUP_LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 220,
            "temperature": 0.0,
            "response_format": {"type": "json_object"},
        }
    try:
        with _HTTPX.Client(timeout=timeout_s) as client:
            resp = client.post(request_url, headers=headers, json=payload)
        if not (200 <= int(resp.status_code) < 300):
            return None
        data = resp.json()
        if isinstance(data, dict):
            choices = data.get("choices") or []
            if choices:
                msg = choices[0].get("message") if isinstance(choices[0], dict) else {}
                content = msg.get("content", "") if isinstance(msg, dict) else ""
                if isinstance(content, str) and content.strip():
                    return content.strip()
            raw = data.get("response")
            if isinstance(raw, str) and raw.strip():
                return raw.strip()
    except Exception:
        return None
    return None


def _rerank_candidates_with_lookup_llm(
    candidates: List[Dict[str, Any]],
    *,
    context_text: str,
) -> List[Dict[str, Any]]:
    if not PACKET_LOOKUP_LLM_ENABLED or not candidates:
        return candidates
    provider = _sanitize_lookup_provider(PACKET_LOOKUP_LLM_PROVIDER)
    if provider not in {"minimax", "openai", "ollama", "anthropic", "gemini"}:
        return candidates
    min_candidates = max(1, int(PACKET_LOOKUP_LLM_MIN_CANDIDATES))
    if len(candidates) < min_candidates:
        return candidates

    top_k = max(1, min(len(candidates), int(PACKET_LOOKUP_LLM_TOP_K)))
    context = str(context_text or "").strip().replace("\n", " ")
    if context:
        context = context[: max(1, int(PACKET_LOOKUP_LLM_CONTEXT_CHARS))]
    prompt = _build_lookup_payload(candidates, context, top_k)
    response = _call_lookup_llm(prompt, provider=provider, timeout_s=PACKET_LOOKUP_LLM_TIMEOUT_S)
    if not response:
        return candidates
    ranked_ids = _extract_json_like_array(response)
    if not ranked_ids:
        return candidates

    ranked = list(ranked_ids)
    lookup = {str(row.get("packet_id") or ""): row for row in candidates}
    reranked: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for packet_id in ranked:
        packet_id = str(packet_id or "").strip()
        if not packet_id or packet_id in seen:
            continue
        row = lookup.get(packet_id)
        if row is not None:
            row = dict(row)
            row["llm_rank"] = len(reranked)
            row["llm_reranked"] = True
            reranked.append(row)
            seen.add(packet_id)

    for row in candidates:
        packet_id = str(row.get("packet_id") or "")
        if packet_id in seen:
            continue
        row = dict(row)
        row["llm_rank"] = len(reranked)
        row["llm_reranked"] = False
        reranked.append(row)
    return reranked
