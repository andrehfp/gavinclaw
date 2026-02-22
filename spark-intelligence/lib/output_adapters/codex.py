"""Codex output adapter (`SPARK_CONTEXT_FOR_CODEX.md` + payload).

This writes a focused advisory context file alongside advisory metadata so
Codex sessions can consume both human-readable and machine-readable context.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .common import write_json, write_marked_section


def write(
    context: str,
    project_dir: Optional[Path] = None,
    advisory_payload: Optional[dict] = None,
) -> bool:
    root = project_dir or Path.cwd()
    path = root / "SPARK_CONTEXT_FOR_CODEX.md"
    ok = write_marked_section(path, context, create_header="# SPARK CODEX CONTEXT")
    if advisory_payload is not None:
        write_json(root / "SPARK_ADVISORY_PAYLOAD.json", advisory_payload)
    return ok

