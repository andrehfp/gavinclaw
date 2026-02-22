from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "run_chip_learning_diagnostics.py"
    spec = importlib.util.spec_from_file_location("run_chip_learning_diagnostics", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load run_chip_learning_diagnostics")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_markdown_render_includes_core_metrics():
    mod = _load_module()
    report = {
        "generated_at": "2026-02-13T00:00:00+00:00",
        "limits": {"min_cognitive_value": 0.35},
        "rows_analyzed": 100,
        "merge_eligible": 3,
        "active_only": True,
        "max_age_days": 14,
        "observer_limit": 12,
        "telemetry_rate": 0.9,
        "statement_yield_rate": 0.1,
        "learning_quality_pass_rate": 0.05,
        "chips": [
            {
                "chip_id": "marketing",
                "rows": 10,
                "telemetry_rate": 0.2,
                "statement_yield_rate": 0.4,
                "learning_quality_pass_rate": 0.3,
                "merge_eligible": 2,
                "sample_statements": ["Use evidence from campaign topic testing."],
            }
        ],
        "observers": [
            {
                "observer": "marketing/reply_effectiveness",
                "rows": 8,
                "schema_payload_rate": 0.5,
                "schema_statement_rate": 0.5,
                "statement_yield_rate": 0.5,
                "merge_eligible": 2,
                "telemetry_rate": 0.25,
            }
        ],
    }
    md = mod._md(report)
    assert "Chip Learning Diagnostics" in md
    assert "`marketing`" in md
    assert "Merge Eligible" in md
    assert "Observer KPIs" in md


def test_apply_limit_overrides_clamps_ranges():
    mod = _load_module()
    base = {
        "duplicate_churn_ratio": 0.8,
        "duplicate_churn_min_processed": 10,
        "duplicate_churn_cooldown_s": 1800,
        "min_cognitive_value": 0.35,
        "min_actionability": 0.25,
        "min_transferability": 0.2,
        "min_statement_len": 28,
    }
    args = SimpleNamespace(
        min_cognitive_value=2.0,
        min_actionability=-1.0,
        min_transferability=0.42,
        min_statement_len=9,
        duplicate_churn_ratio=0.3,
        duplicate_churn_min_processed=2001,
        duplicate_churn_cooldown_s=1,
    )

    out = mod._apply_limit_overrides(base, args)
    assert out["min_cognitive_value"] == 1.0
    assert out["min_actionability"] == 0.0
    assert out["min_transferability"] == 0.42
    assert out["min_statement_len"] == 12
    assert out["duplicate_churn_ratio"] == 0.5
    assert out["duplicate_churn_min_processed"] == 1000
    assert out["duplicate_churn_cooldown_s"] == 60
