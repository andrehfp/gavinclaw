"""
Shared error taxonomy helpers for memory/advisory/retrieval surfaces.

Canonical kinds:
- policy
- auth
- timeout
- transport
- no_hit
- stale
- unknown
"""

from __future__ import annotations

from typing import Any, Dict, Optional

ERROR_KINDS = (
    "policy",
    "auth",
    "timeout",
    "transport",
    "no_hit",
    "stale",
    "unknown",
)


def _norm(message: Optional[str]) -> str:
    return str(message or "").strip().lower()


def classify_error_kind(message: Optional[str]) -> str:
    """
    Deterministically classify an error message.

    Priority order is intentional and mirrors the active operations plan:
    policy -> auth -> timeout -> transport -> no_hit -> stale -> unknown
    """
    text = _norm(message)

    if any(
        token in text
        for token in (
            "policy",
            "guardrail",
            "blocked by rule",
            "restricted by rule",
            "not allowed by policy",
            "forbidden by policy",
            "safety policy",
        )
    ):
        return "policy"

    if any(
        token in text
        for token in (
            "401",
            "403",
            "unauthorized",
            "unauthorised",
            "authentication",
            "auth",
            "credential",
            "api key",
            "apikey",
            "token invalid",
            "token missing",
        )
    ):
        return "auth"

    if any(
        token in text
        for token in (
            "timeout",
            "timed out",
            "deadline exceeded",
            "deadline",
            "took too long",
            "time limit",
        )
    ):
        return "timeout"

    if any(
        token in text
        for token in (
            "transport",
            "network",
            "connection",
            "connect",
            "dns",
            "socket",
            "ssl",
            "tls",
            "gateway",
            "connection refused",
            "connection reset",
        )
    ):
        return "transport"

    if any(
        token in text
        for token in (
            "no advice",
            "no results",
            "no retrieval",
            "no hit",
            "empty result",
            "nothing found",
        )
    ):
        return "no_hit"

    if any(
        token in text
        for token in (
            "stale",
            "outdated",
            "expired",
            "index lag",
            "age exceeded",
        )
    ):
        return "stale"

    return "unknown"


def build_error_fields(
    message: Optional[str],
    error_code: Optional[str] = None,
    *,
    kind: Optional[str] = None,
    max_message_chars: int = 300,
) -> Dict[str, Any]:
    """
    Build normalized error payload fields for logs/status payloads.
    """
    msg = str(message or "").strip()
    return {
        "error_kind": kind or classify_error_kind(msg),
        "error_code": str(error_code or "").strip() or None,
        "error_message": msg[:max(0, int(max_message_chars))] if msg else None,
    }

