from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "run_chip_schema_multiseed.py"
    spec = importlib.util.spec_from_file_location("run_chip_schema_multiseed", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load run_chip_schema_multiseed")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_aggregate_computes_means_and_win_rate():
    mod = _load_module()
    seed_reports = [
        {
            "seed": 1,
            "winner_id": "A",
            "experiments": [
                {"id": "A", "mode": "a", "objective": 0.7, "capture_coverage": 0.6, "schema_statement_rate": 1.0, "merge_eligible_rate": 0.1, "telemetry_rate": 0.0, "payload_valid_emission_rate": 1.0},
                {"id": "B", "mode": "b", "objective": 0.6, "capture_coverage": 0.5, "schema_statement_rate": 0.9, "merge_eligible_rate": 0.0, "telemetry_rate": 0.0, "payload_valid_emission_rate": 1.0},
            ],
        },
        {
            "seed": 2,
            "winner_id": "B",
            "experiments": [
                {"id": "A", "mode": "a", "objective": 0.5, "capture_coverage": 0.4, "schema_statement_rate": 1.0, "merge_eligible_rate": 0.0, "telemetry_rate": 0.1, "payload_valid_emission_rate": 1.0},
                {"id": "B", "mode": "b", "objective": 0.8, "capture_coverage": 0.7, "schema_statement_rate": 0.9, "merge_eligible_rate": 0.2, "telemetry_rate": 0.0, "payload_valid_emission_rate": 0.9},
            ],
        },
    ]

    out = mod._aggregate(seed_reports)
    a = next(x for x in out if x["id"] == "A")
    b = next(x for x in out if x["id"] == "B")
    assert a["win_rate"] == 0.5
    assert b["win_rate"] == 0.5
    assert a["objective_mean"] == 0.6
    assert b["objective_mean"] == 0.7
    assert a["coverage_mean"] == 0.5
    assert b["coverage_mean"] == 0.6


def test_parse_seeds_prefers_explicit_list():
    mod = _load_module()

    class Args:
        seeds = "10, 11,12"
        seed_start = 100
        seed_count = 3

    out = mod._parse_seeds(Args())
    assert out == [10, 11, 12]
