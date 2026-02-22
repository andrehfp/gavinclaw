import os
from typing import Dict, Any

from .store import update_job_status
from .codex_client import build_plan
from .instacli_exec import execute_job


def run_job(job_id: str, job_type: str, payload: Dict[str, Any]) -> None:
    update_job_status(job_id, "running")
    try:
        # Step 1) Ask Codex App Server for execution plan
        planner = build_plan(job_type, payload)

        # Step 2) Execute mapped InstaCLI operation (stub/live)
        result = execute_job(job_type, payload)

        final_result = {
            "ok": True,
            "planner": planner,
            "execution": result,
        }
        update_job_status(job_id, "succeeded", result_json=final_result)
    except Exception as exc:
        if os.getenv("INSTARELAY_FAIL_ON_PLANNER_ERROR", "0") == "1":
            update_job_status(job_id, "failed", error=f"planner/execution error: {exc}")
            return
        update_job_status(job_id, "failed", error=str(exc))
