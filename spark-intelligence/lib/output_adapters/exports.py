"""Export-only outputs for hosted platforms (GPT/Gemini)."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from .common import write_json, write_text


def write_exports(context: str, advisory_payload: Optional[dict] = None) -> bool:
    base = Path.home() / ".spark" / "exports"
    ok1 = write_text(base / "gpt_instructions.md", context)
    ok2 = write_text(base / "gemini_system.md", context)
    if advisory_payload is not None:
        write_json(base / "SPARK_ADVISORY_PAYLOAD.json", advisory_payload)
    return bool(ok1 and ok2)
