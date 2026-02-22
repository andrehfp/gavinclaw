import json
import os
import subprocess
from typing import Any, Dict, List


def _run(cmd: List[str]) -> Dict[str, Any]:
    out = subprocess.check_output(cmd, text=True)
    try:
        return json.loads(out)
    except Exception:
        return {"raw": out}


def execute_job(job_type: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Execute mapped InstaCLI command.

    Set INSTARELAY_EXEC_MODE=stub to skip real execution.
    """
    mode = os.getenv("INSTARELAY_EXEC_MODE", "stub")
    if mode == "stub":
        return {
            "ok": True,
            "mode": "stub",
            "job_type": job_type,
            "payload": payload,
        }

    account = payload["account_name"]

    if job_type == "publish.photo":
        cmd = [
            "instacli",
            "publish",
            "photo",
            "--account",
            account,
            "--file",
            payload["file_url"],
            "--caption",
            payload.get("caption", ""),
            "--json",
            "--quiet",
        ]
        return _run(cmd)

    if job_type == "publish.carousel":
        cmd = [
            "instacli",
            "publish",
            "carousel",
            "--account",
            account,
            "--caption",
            payload.get("caption", ""),
            "--json",
            "--quiet",
            "--files",
            *payload["file_urls"],
        ]
        return _run(cmd)

    if job_type == "comments.inbox":
        cmd = [
            "instacli",
            "comments",
            "inbox",
            "--account",
            account,
            "--days",
            str(payload.get("days", 7)),
            "--limit",
            str(payload.get("limit", 20)),
            "--json",
            "--quiet",
        ]
        return _run(cmd)

    if job_type == "comments.reply":
        cmd = [
            "instacli",
            "comments",
            "reply",
            "--account",
            account,
            "--comment",
            payload["comment_id"],
            "--text",
            payload["text"],
            "--json",
            "--quiet",
        ]
        return _run(cmd)

    if job_type == "analytics.summary":
        cmd = [
            "instacli",
            "analytics",
            "summary",
            "--account",
            account,
            "--days",
            str(payload.get("days", 7)),
            "--json",
            "--quiet",
        ]
        return _run(cmd)

    raise ValueError(f"Unsupported job_type: {job_type}")
