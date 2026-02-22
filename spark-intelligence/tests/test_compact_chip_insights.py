from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "compact_chip_insights.py"
    spec = importlib.util.spec_from_file_location("compact_chip_insights", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load compact_chip_insights")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_retain_rows_prefers_schema_rows():
    mod = _load_module()
    rows = [
        {"timestamp": "2026-02-13T00:00:00+00:00", "captured_data": {}},
        {"timestamp": "2026-02-13T00:01:00+00:00", "captured_data": {"learning_payload": {"decision": "a"}}},
        {"timestamp": "2026-02-13T00:02:00+00:00", "captured_data": {}},
        {"timestamp": "2026-02-13T00:03:00+00:00", "captured_data": {"learning_payload": {"decision": "b"}}},
    ]
    kept = mod._retain_rows(rows, keep_lines=2, prefer_schema=True)
    assert len(kept) == 2
    assert all(mod._is_schema_row(r) for r in kept)


def test_filter_rows_applies_age_window():
    mod = _load_module()
    now = datetime.now(timezone.utc)
    rows = [
        {"timestamp": (now - timedelta(days=40)).isoformat()},
        {"timestamp": (now - timedelta(days=1)).isoformat()},
    ]
    kept = mod._filter_rows(rows, max_age_days=20)
    assert len(kept) == 1

