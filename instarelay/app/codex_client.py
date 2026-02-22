import json
import os
from typing import Any, Dict

import requests


def _extract_text(data: Dict[str, Any]) -> str:
    if isinstance(data.get("output_text"), str) and data["output_text"].strip():
        return data["output_text"].strip()

    output = data.get("output") or []
    chunks: list[str] = []
    for item in output:
        for content in item.get("content", []):
            text = content.get("text")
            if text:
                chunks.append(text)
    return "\n".join(chunks).strip()


def build_plan(job_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Ask Codex App Server for a structured execution plan for this job.

    Set INSTARELAY_CODEX_MOCK=1 to bypass network and return deterministic output.
    """
    if os.getenv("INSTARELAY_CODEX_MOCK", "0") == "1":
        return {
            "mode": "mock",
            "job_type": job_type,
            "summary": "mock codex plan",
            "payload": payload,
        }

    base_url = os.getenv("CODEX_APP_SERVER_URL", "http://127.0.0.1:8765").rstrip("/")
    api_key = os.getenv("CODEX_APP_SERVER_API_KEY", "")
    model = os.getenv("CODEX_MODEL", "gpt-5.3-codex")

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    system_prompt = (
        "You are InstaRelay Planner. Return only compact JSON with keys: "
        "job_type, summary, checks, risks, suggested_command."
    )

    payload_json = {
        "model": model,
        "input": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"job_type={job_type}\npayload={json.dumps(payload, ensure_ascii=False)}",
            },
        ],
    }

    response = requests.post(f"{base_url}/v1/responses", headers=headers, json=payload_json, timeout=45)
    response.raise_for_status()
    data = response.json()

    text = _extract_text(data)
    if not text:
        return {
            "mode": "remote",
            "job_type": job_type,
            "summary": "empty planner response",
            "raw": data,
        }

    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            parsed.setdefault("mode", "remote")
            return parsed
    except Exception:
        pass

    return {
        "mode": "remote",
        "job_type": job_type,
        "summary": text[:400],
    }
