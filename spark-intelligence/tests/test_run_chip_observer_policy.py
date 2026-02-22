from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "scripts" / "run_chip_observer_policy.py"
    spec = importlib.util.spec_from_file_location("run_chip_observer_policy", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load run_chip_observer_policy")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_evaluate_marks_noisy_observer_for_disable():
    mod = _load_module()
    observed = {
        "x_social/chip_level": {
            "observer": "x_social/chip_level",
            "windows": 3,
            "rows_total": 300,
            "schema_statement_rates": [0.0, 0.0, 0.0],
            "schema_payload_rates": [0.0, 0.0, 0.0],
            "telemetry_rates": [0.95, 0.94, 0.96],
            "merge_eligible_counts": [0, 0, 0],
            "reports": ["r1", "r2", "r3"],
        }
    }
    out = mod._evaluate(
        observed,
        min_windows=2,
        min_rows_total=50,
        disable_max_schema_statement_rate=0.02,
        disable_min_telemetry_rate=0.8,
        keep_min_schema_statement_rate=0.15,
        keep_min_merge_eligible=1,
    )
    assert len(out["disabled"]) == 1
    assert out["disabled"][0]["observer"] == "x_social/chip_level"


def test_policy_payload_normalizes_observer_keys():
    mod = _load_module()
    policy = mod._policy_payload(
        report_paths=["r1.json"],
        disabled_rows=[{"observer": "x_social/chip_level"}],
        keep_rows=[{"observer": "social-convo/reply_effectiveness"}],
        windows=3,
        thresholds={},
    )
    assert "x-social/chip_level" in policy["disabled_observers"]
    assert "chip_level" in policy["disabled_observer_names"]
    assert "social-convo/reply_effectiveness" in policy["keep_observers"]
