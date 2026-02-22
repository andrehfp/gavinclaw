from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "run_advisory_realism_domain_matrix.py"
    spec = importlib.util.spec_from_file_location("run_advisory_realism_domain_matrix", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load run_advisory_realism_domain_matrix")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_group_cases_respects_min_cases_and_allowlist():
    mod = _load_module()
    rows = [
        {"id": "a1", "domain": "coding"},
        {"id": "a2", "domain": "coding"},
        {"id": "b1", "domain": "strategy"},
    ]

    grouped = mod._group_cases(rows, min_cases=2, allow_domains=None)
    assert sorted(grouped.keys()) == ["coding"]

    grouped_allow = mod._group_cases(rows, min_cases=1, allow_domains={"strategy"})
    assert sorted(grouped_allow.keys()) == ["strategy"]


def test_norm_domain_and_weighted_avg():
    mod = _load_module()
    assert mod._norm_domain("UI Design") == "ui_design"
    assert mod._slug("Conversation / Coaching") == "conversation_coaching"

    runs = [
        mod.DomainRun(
            domain="coding",
            case_count=2,
            winner_profile="balanced",
            objective=0.8,
            score=0.7,
            high_value_rate=0.6,
            harmful_emit_rate=0.1,
            unsolicited_emit_rate=0.1,
            critical_miss_rate=0.0,
            source_alignment_rate=0.7,
            theory_discrimination_rate=0.8,
            trace_bound_rate=1.0,
            all_gates_pass=True,
            gates={},
        ),
        mod.DomainRun(
            domain="strategy",
            case_count=1,
            winner_profile="baseline",
            objective=0.2,
            score=0.3,
            high_value_rate=0.1,
            harmful_emit_rate=0.2,
            unsolicited_emit_rate=0.2,
            critical_miss_rate=0.1,
            source_alignment_rate=0.2,
            theory_discrimination_rate=0.3,
            trace_bound_rate=0.8,
            all_gates_pass=False,
            gates={},
        ),
    ]
    # (0.8*2 + 0.2*1) / 3 = 0.6
    assert mod._weighted_avg(runs, "objective") == 0.6
