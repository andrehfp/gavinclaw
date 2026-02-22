import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import uuid4

DB_PATH = "instarelay.db"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            account_name TEXT NOT NULL,
            job_type TEXT NOT NULL,
            status TEXT NOT NULL,
            request_json TEXT NOT NULL,
            result_json TEXT,
            error TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def create_job(workspace_id: str, account_name: str, job_type: str, request_json: Dict[str, Any]) -> str:
    job_id = str(uuid4())
    ts = now_iso()
    conn = get_conn()
    conn.execute(
        """
        INSERT INTO jobs (id, workspace_id, account_name, job_type, status, request_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (job_id, workspace_id, account_name, job_type, "pending", json.dumps(request_json), ts, ts),
    )
    conn.commit()
    conn.close()
    return job_id


def update_job_status(job_id: str, status: str, result_json: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> None:
    conn = get_conn()
    conn.execute(
        """
        UPDATE jobs
        SET status = ?, result_json = ?, error = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, json.dumps(result_json) if result_json is not None else None, error, now_iso(), job_id),
    )
    conn.commit()
    conn.close()


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    conn = get_conn()
    cur = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "account_name": row["account_name"],
        "job_type": row["job_type"],
        "status": row["status"],
        "request_json": json.loads(row["request_json"]),
        "result_json": json.loads(row["result_json"]) if row["result_json"] else None,
        "error": row["error"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
