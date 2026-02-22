from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[1]
    module_path = root / "benchmarks" / "emotion_memory_alignment_bench.py"
    spec = importlib.util.spec_from_file_location("emotion_memory_alignment_bench", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("failed to load emotion_memory_alignment_bench module")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_emotion_memory_benchmark_gate_passes():
    mod = _load_module()
    report = mod.run_benchmark(
        emotion_state_weight=0.45,
        min_top1_hit_rate=0.75,
        min_uplift=0.25,
    )
    assert report["baseline"]["top1_hit_rate"] < report["emotion_enabled"]["top1_hit_rate"]
    assert report["gates"]["passed"] is True
