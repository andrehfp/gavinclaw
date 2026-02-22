"""Deterministic prefetch planning for predictive advisory packets."""

from __future__ import annotations

from typing import Any, Dict, List


INTENT_TOOL_PRIORS: Dict[str, List[Dict[str, Any]]] = {
    "auth_security": [
        {"tool_name": "Read", "probability": 0.85},
        {"tool_name": "Edit", "probability": 0.82},
        {"tool_name": "Bash", "probability": 0.68},
    ],
    "testing_validation": [
        {"tool_name": "Bash", "probability": 0.9},
        {"tool_name": "Read", "probability": 0.7},
        {"tool_name": "Edit", "probability": 0.6},
    ],
    "deployment_ops": [
        {"tool_name": "Bash", "probability": 0.92},
        {"tool_name": "Read", "probability": 0.65},
        {"tool_name": "Edit", "probability": 0.45},
    ],
    "schema_contracts": [
        {"tool_name": "Read", "probability": 0.84},
        {"tool_name": "Edit", "probability": 0.74},
        {"tool_name": "Grep", "probability": 0.7},
    ],
    "performance_latency": [
        {"tool_name": "Read", "probability": 0.74},
        {"tool_name": "Bash", "probability": 0.8},
        {"tool_name": "Edit", "probability": 0.62},
    ],
    "orchestration_execution": [
        {"tool_name": "Task", "probability": 0.88},
        {"tool_name": "Bash", "probability": 0.8},
        {"tool_name": "Read", "probability": 0.58},
    ],
    "knowledge_alignment": [
        {"tool_name": "Read", "probability": 0.92},
        {"tool_name": "Grep", "probability": 0.82},
        {"tool_name": "Edit", "probability": 0.4},
    ],
    "tool_reliability": [
        {"tool_name": "Read", "probability": 0.75},
        {"tool_name": "Edit", "probability": 0.72},
        {"tool_name": "Bash", "probability": 0.55},
    ],
}

FALLBACK_TOOLS: List[Dict[str, Any]] = [
    {"tool_name": "Read", "probability": 0.65},
    {"tool_name": "Edit", "probability": 0.55},
    {"tool_name": "Bash", "probability": 0.5},
]


def plan_prefetch_jobs(
    job: Dict[str, Any],
    *,
    max_jobs: int = 3,
    min_probability: float = 0.4,
) -> List[Dict[str, Any]]:
    """Return deterministic tool-specific prefetch plan rows for one queue job."""
    payload = dict(job or {})
    intent_family = str(payload.get("intent_family") or "emergent_other")
    task_plane = str(payload.get("task_plane") or "build_delivery")
    project_key = str(payload.get("project_key") or "unknown_project")
    session_context_key = str(payload.get("session_context_key") or "default")
    session_id = str(payload.get("session_id") or "")

    priors = INTENT_TOOL_PRIORS.get(intent_family, FALLBACK_TOOLS)
    rows: List[Dict[str, Any]] = []
    for row in priors:
        tool_name = str(row.get("tool_name") or "").strip()
        if not tool_name:
            continue
        probability = float(row.get("probability") or 0.0)
        if probability < float(min_probability):
            continue
        rows.append(
            {
                "session_id": session_id,
                "project_key": project_key,
                "session_context_key": session_context_key,
                "intent_family": intent_family,
                "task_plane": task_plane,
                "tool_name": tool_name,
                "probability": probability,
            }
        )

    rows.sort(key=lambda x: float(x.get("probability", 0.0)), reverse=True)
    return rows[: max(1, int(max_jobs or 1))]

