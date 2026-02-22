from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "advisory_day_trial.py"
    spec = importlib.util.spec_from_file_location("advisory_day_trial", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load advisory_day_trial")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_summarize_feedback_rows_rates():
    mod = _load_module()
    rows = [
        {"status": "acted", "helpful": True, "notes": "used as-is"},
        {"status": "blocked", "helpful": False, "notes": "too noisy"},
        {"status": "ignored", "helpful": None, "notes": "maybe later"},
        {"status": "acted", "helpful": True, "notes": "edited before applying"},
    ]
    summary = mod.summarize_feedback_rows(rows)
    assert summary["total_feedback"] == 4
    assert summary["acted"] == 2
    assert summary["rejected"] == 1
    assert summary["edited"] == 1
    assert abs(float(summary["acceptance_rate"]) - 0.5) < 1e-9
    assert abs(float(summary["noisy_rate"]) - 0.5) < 1e-9


def test_summarize_request_rows_sources_and_recent():
    mod = _load_module()
    rows = [
        {
            "tool": "Bash",
            "created_at": 100.0,
            "advice_ids": ["a1"],
            "advice_texts": ["Use rg for fast search"],
            "sources": ["semantic", "cognitive"],
        },
        {
            "tool": "Edit",
            "created_at": 101.0,
            "advice_ids": ["a2", "a3"],
            "advice_texts": ["Add tests", "Run pytest"],
            "sources": ["cognitive"],
        },
    ]
    summary = mod.summarize_request_rows(rows)
    assert summary["request_count"] == 2
    assert summary["advice_shown_count"] == 3
    assert summary["by_tool"]["Bash"] == 1
    assert summary["by_tool"]["Edit"] == 1
    top_sources = {row["source"]: row["count"] for row in summary["top_memory_sources"]}
    assert top_sources["cognitive"] == 2
    assert top_sources["semantic"] == 1
    assert len(summary["recent_recommendations"]) == 3


def test_build_wow_and_failures_from_feedback():
    mod = _load_module()
    feedback_rows = [
        {"created_at": 201.0, "status": "acted", "helpful": True, "advice_ids": ["a1"], "notes": "worked"},
        {"created_at": 202.0, "status": "harmful", "helpful": False, "advice_ids": ["a2"], "notes": "bad context"},
    ]
    rec_index = {
        "a1": {"recommendation": "Use strict gate", "tool": "Bash", "sources": ["semantic"]},
        "a2": {"recommendation": "Skip tests", "tool": "Edit", "sources": ["cognitive"]},
    }
    wow, failures = mod._build_wow_and_failures(feedback_rows, rec_index, limit=5)
    assert len(wow) == 1
    assert wow[0]["advice_id"] == "a1"
    assert len(failures) == 1
    assert failures[0]["advice_id"] == "a2"
