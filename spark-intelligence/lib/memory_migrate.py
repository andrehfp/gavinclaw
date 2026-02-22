"""One-time migration of JSONL memory banks into SQLite store."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from lib.memory_banks import PROJECTS_DIR, GLOBAL_FILE, _read_jsonl
from lib.memory_store import upsert_entry


def _load_jsonl(path: Path, limit: int = 20000) -> List[Dict[str, Any]]:
    return _read_jsonl(path, limit=limit)


def migrate(limit_per_file: int = 20000) -> Dict[str, int]:
    """Backfill JSONL banks into SQLite memory store."""
    migrated = 0
    skipped = 0
    files = []

    if GLOBAL_FILE.exists():
        files.append(GLOBAL_FILE)
    if PROJECTS_DIR.exists():
        for p in PROJECTS_DIR.glob("*.jsonl"):
            files.append(p)

    for path in files:
        rows = _load_jsonl(path, limit=limit_per_file)
        for it in rows:
            try:
                upsert_entry(
                    memory_id=it.get("entry_id") or "",
                    content=it.get("text") or "",
                    scope=it.get("scope") or "global",
                    project_key=it.get("project_key"),
                    category=it.get("category") or "memory",
                    created_at=float(it.get("created_at") or 0.0),
                    source=it.get("source") or "spark",
                    meta=it.get("meta") or {},
                )
                migrated += 1
            except Exception:
                skipped += 1

    return {"migrated": migrated, "skipped": skipped, "files": len(files)}


def main() -> int:
    stats = migrate()
    print(stats)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
