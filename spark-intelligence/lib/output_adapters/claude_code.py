"""Claude Code output adapter (CLAUDE.md)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .common import write_json, write_marked_section


def write(context: str, project_dir: Optional[Path] = None, advisory_payload: Optional[dict] = None) -> bool:
    root = project_dir or Path.cwd()
    path = root / "CLAUDE.md"
    ok = write_marked_section(path, context, create_header="# CLAUDE")
    if advisory_payload is not None:
        write_json(root / "SPARK_ADVISORY_PAYLOAD.json", advisory_payload)
    return ok
