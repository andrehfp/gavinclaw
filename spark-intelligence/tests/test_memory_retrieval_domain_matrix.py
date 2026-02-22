from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "benchmarks" / "memory_retrieval_domain_matrix.py"
    spec = importlib.util.spec_from_file_location("memory_retrieval_domain_matrix", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load memory_retrieval_domain_matrix")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_infer_domain_uses_query_markers():
    mod = _load_module()
    assert mod.infer_domain(query="debug python traceback in module", notes="") == "coding"
    assert mod.infer_domain(query="optimize memory retrieval and stale index behavior", notes="") == "memory"
    assert mod.infer_domain(query="tweet engagement strategy for launch", notes="") == "x_social"


def test_group_cases_respects_min_cases_and_allowlist():
    mod = _load_module()
    rows = [
        mod.DomainCase(
            domain="coding",
            case=mod.mra.EvalCase(case_id="c1", query="debug api"),
        ),
        mod.DomainCase(
            domain="coding",
            case=mod.mra.EvalCase(case_id="c2", query="refactor api"),
        ),
        mod.DomainCase(
            domain="memory",
            case=mod.mra.EvalCase(case_id="m1", query="memory retrieval"),
        ),
    ]
    grouped = mod.group_cases(rows, min_cases=2, allow_domains=None)
    assert sorted(grouped.keys()) == ["coding"]
    grouped_filtered = mod.group_cases(rows, min_cases=1, allow_domains={"memory"})
    assert sorted(grouped_filtered.keys()) == ["memory"]


def test_evaluate_domain_gates_fails_when_quality_missing():
    mod = _load_module()
    summary = {
        "mrr": None,
        "top1_hit_rate": None,
        "non_empty_rate": 0.75,
        "error_rate": 0.02,
    }
    gates = {"mrr_min": 0.2, "top1_hit_rate_min": 0.1, "non_empty_rate_min": 0.6, "error_rate_max": 0.1}
    out = mod.evaluate_domain_gates(summary, gates)
    assert out.checks["mrr_min"] is False
    assert out.checks["top1_hit_rate_min"] is False
    assert out.checks["non_empty_rate_min"] is True
    assert out.checks["error_rate_max"] is True
    assert out.all_pass is False
