"""Strict attribution smoke test runner.

Runs two end-to-end advisor -> Meta-Ralph loops in isolated temp storage:
1) PASS case: retrieval and outcome share trace_id (should pass strict gates)
2) FAIL case: retrieval/outcome trace_id mismatch (should fail strict gates)

Usage:
    python scripts/strict_attribution_smoke.py
"""

from __future__ import annotations

import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

import lib.advisor as advisor_mod
import lib.meta_ralph as meta_ralph_mod
from lib.advisor import Advice
from lib.production_gates import (
    LoopMetrics,
    LoopThresholds,
    evaluate_gates,
    format_gate_report,
)


class _DummyCognitive:
    pass


class _SmokeAdvisor(advisor_mod.SparkAdvisor):
    def __init__(self, advice_items: Iterable[Advice]):
        self._smoke_advice = list(advice_items)
        super().__init__()

    def _get_bank_advice(self, _context: str):
        return []

    def _get_cognitive_advice(self, _tool_name: str, _context: str, _semantic_context: str = ""):
        return list(self._smoke_advice)

    def _get_chip_advice(self, _context: str):
        return []

    def _get_tool_specific_advice(self, _tool_name: str):
        return []

    def _get_surprise_advice(self, _tool_name: str, _context: str):
        return []

    def _get_skill_advice(self, _context: str):
        return []

    def _get_convo_advice(self, _tool_name: str, _context: str):
        return []

    def _get_engagement_advice(self, _tool_name: str, _context: str):
        return []

    def _get_niche_advice(self, _tool_name: str, _context: str):
        return []

    def _rank_advice(self, advice_list):
        return list(advice_list)

    def _rank_score(self, _advice):
        return 1.0


def _make_advice(advice_id: str) -> Advice:
    return Advice(
        advice_id=advice_id,
        insight_key=f"insight:{advice_id}",
        text=f"Apply {advice_id}",
        confidence=0.95,
        source="cognitive",
        context_match=1.0,
        reason="strict-smoke",
    )


@contextmanager
def _isolated_runtime(tmp_root: Path):
    advisor_attrs = {
        "ADVISOR_DIR": advisor_mod.ADVISOR_DIR,
        "ADVICE_LOG": advisor_mod.ADVICE_LOG,
        "RECENT_ADVICE_LOG": advisor_mod.RECENT_ADVICE_LOG,
        "EFFECTIVENESS_FILE": advisor_mod.EFFECTIVENESS_FILE,
        "ADVISOR_METRICS": advisor_mod.ADVISOR_METRICS,
        "HAS_EIDOS": advisor_mod.HAS_EIDOS,
        "HAS_REQUESTS": advisor_mod.HAS_REQUESTS,
        "get_cognitive_learner": advisor_mod.get_cognitive_learner,
        "get_mind_bridge": advisor_mod.get_mind_bridge,
    }
    meta_class_attrs = {
        "DATA_DIR": meta_ralph_mod.MetaRalph.DATA_DIR,
        "ROAST_HISTORY_FILE": meta_ralph_mod.MetaRalph.ROAST_HISTORY_FILE,
        "OUTCOME_TRACKING_FILE": meta_ralph_mod.MetaRalph.OUTCOME_TRACKING_FILE,
        "LEARNINGS_STORE_FILE": meta_ralph_mod.MetaRalph.LEARNINGS_STORE_FILE,
        "SELF_ROAST_FILE": meta_ralph_mod.MetaRalph.SELF_ROAST_FILE,
    }
    original_meta_singleton = meta_ralph_mod._meta_ralph

    advisor_dir = tmp_root / "advisor"
    meta_dir = tmp_root / "meta_ralph"
    advisor_mod.ADVISOR_DIR = advisor_dir
    advisor_mod.ADVICE_LOG = advisor_dir / "advice_log.jsonl"
    advisor_mod.RECENT_ADVICE_LOG = advisor_dir / "recent_advice.jsonl"
    advisor_mod.EFFECTIVENESS_FILE = advisor_dir / "effectiveness.json"
    advisor_mod.ADVISOR_METRICS = advisor_dir / "metrics.json"
    advisor_mod.HAS_EIDOS = False
    advisor_mod.HAS_REQUESTS = False
    advisor_mod.get_cognitive_learner = lambda: _DummyCognitive()
    advisor_mod.get_mind_bridge = lambda: None

    meta_ralph_mod.MetaRalph.DATA_DIR = meta_dir
    meta_ralph_mod.MetaRalph.ROAST_HISTORY_FILE = meta_dir / "roast_history.json"
    meta_ralph_mod.MetaRalph.OUTCOME_TRACKING_FILE = meta_dir / "outcome_tracking.json"
    meta_ralph_mod.MetaRalph.LEARNINGS_STORE_FILE = meta_dir / "learnings_store.json"
    meta_ralph_mod.MetaRalph.SELF_ROAST_FILE = meta_dir / "self_roast.json"
    meta_ralph_mod._meta_ralph = None

    try:
        yield
    finally:
        for k, v in advisor_attrs.items():
            setattr(advisor_mod, k, v)
        for k, v in meta_class_attrs.items():
            setattr(meta_ralph_mod.MetaRalph, k, v)
        meta_ralph_mod._meta_ralph = original_meta_singleton


def _build_metrics(ralph: meta_ralph_mod.MetaRalph, advisor: advisor_mod.SparkAdvisor) -> LoopMetrics:
    out = ralph.get_outcome_stats()
    attr = ralph.get_source_attribution(limit=8, window_s=1200, require_trace=True)
    totals = attr.get("totals") or {}
    mode = attr.get("attribution_mode") or {}

    total_retrieved = int(out.get("total_tracked", 0) or 0)
    actionable_retrieved = int(out.get("actionable_tracked", total_retrieved) or 0)
    acted_on = int(out.get("acted_on", 0) or 0)
    strict_acted_on = int(totals.get("strict_acted_on", 0) or 0)
    strict_with_outcome = int(totals.get("strict_with_explicit_outcome", 0) or 0)
    strict_effectiveness_rate = totals.get("strict_effectiveness_rate")
    strict_eff = float(strict_effectiveness_rate) if strict_effectiveness_rate is not None else 0.0

    retrieval_rate = (
        total_retrieved / max(actionable_retrieved, 1)
        if actionable_retrieved > 0
        else 0.0
    )
    acted_on_rate = acted_on / max(actionable_retrieved, 1) if actionable_retrieved > 0 else 0.0
    strict_acted_on_rate = (
        strict_acted_on / max(actionable_retrieved, 1)
        if actionable_retrieved > 0
        else 0.0
    )
    strict_trace_coverage = strict_acted_on / max(acted_on, 1) if acted_on > 0 else 0.0
    eff = advisor.effectiveness if isinstance(advisor.effectiveness, dict) else {}

    return LoopMetrics(
        total_stored=max(actionable_retrieved, 1),
        total_retrieved=total_retrieved,
        actionable_retrieved=actionable_retrieved,
        ignored_non_actionable=int(out.get("ignored_non_actionable", 0) or 0),
        retrieval_rate=retrieval_rate,
        acted_on=acted_on,
        acted_on_rate=acted_on_rate,
        effectiveness_rate=float(out.get("effectiveness_rate", 0.0) or 0.0),
        strict_acted_on=strict_acted_on,
        strict_with_outcome=strict_with_outcome,
        strict_acted_on_rate=strict_acted_on_rate,
        strict_trace_coverage=strict_trace_coverage,
        strict_effectiveness_rate=strict_eff,
        strict_require_trace=bool(mode.get("require_trace", False)),
        strict_window_s=int(mode.get("window_s", 0) or 0),
        quality_rate=0.45,
        distillations=20,
        queue_depth=0,
        advice_total=int(eff.get("total_advice_given", 0) or 0),
        advice_followed=int(eff.get("total_followed", 0) or 0),
        advice_helpful=int(eff.get("total_helpful", 0) or 0),
        chip_insights=0,
        chip_to_cognitive_ratio=0.0,
    )


def _smoke_thresholds() -> LoopThresholds:
    return LoopThresholds(
        min_retrieval_rate=0.0,
        min_acted_on_rate=0.0,
        min_effectiveness_rate=0.0,
        min_strict_acted_on_rate=0.50,
        min_strict_trace_coverage=0.80,
        min_strict_effectiveness_rate=0.50,
        min_strict_with_outcome=2,
        require_strict_trace_binding=True,
        max_strict_window_s=1800,
        min_distillations=0,
        min_quality_rate=0.0,
        max_quality_rate=1.0,
        max_queue_depth=10_000,
        max_chip_to_cognitive_ratio=10_000.0,
    )


def _check(result: Dict[str, Any], name: str) -> Dict[str, Any]:
    for check in result.get("checks", []):
        if check.get("name") == name:
            return check
    raise KeyError(f"missing gate check: {name}")


def _run_case(case_name: str, retrieval_trace: str, outcome_trace: str) -> Tuple[LoopMetrics, Dict[str, Any]]:
    with tempfile.TemporaryDirectory(prefix=f"strict_smoke_{case_name}_") as tmp:
        with _isolated_runtime(Path(tmp)):
            advice_items = [_make_advice(f"{case_name}:a1"), _make_advice(f"{case_name}:a2")]
            advisor = _SmokeAdvisor(advice_items)
            advice = advisor.advise(
                "Edit",
                {"file_path": "src/app.py"},
                "strict attribution smoke",
                include_mind=False,
                trace_id=retrieval_trace,
            )
            if len(advice) < 2:
                raise RuntimeError(f"{case_name}: expected at least 2 advice items, got {len(advice)}")

            advisor.report_action_outcome(
                "Edit",
                success=True,
                advice_was_relevant=True,
                trace_id=outcome_trace,
            )

            ralph = meta_ralph_mod.get_meta_ralph()
            metrics = _build_metrics(ralph, advisor)
            result = evaluate_gates(metrics, thresholds=_smoke_thresholds())
            return metrics, result


def main() -> int:
    print("Running strict attribution smoke scenarios...")

    pass_metrics, pass_result = _run_case(
        case_name="strict_pass",
        retrieval_trace="trace-smoke-pass-1",
        outcome_trace="trace-smoke-pass-1",
    )
    print("")
    print("=== PASS SCENARIO (trace-bound) ===")
    print(format_gate_report(pass_metrics, pass_result))

    fail_metrics, fail_result = _run_case(
        case_name="strict_fail",
        retrieval_trace="trace-smoke-fail-1",
        outcome_trace="trace-smoke-fail-mismatch-1",
    )
    print("")
    print("=== FAIL SCENARIO (trace mismatch) ===")
    print(format_gate_report(fail_metrics, fail_result))

    pass_ok = bool(pass_result.get("ready"))
    fail_expected = not bool(fail_result.get("ready"))
    fail_coverage = not _check(fail_result, "strict_trace_coverage").get("ok", True)
    fail_rate = not _check(fail_result, "strict_acted_on_rate").get("ok", True)

    if pass_ok and fail_expected and fail_coverage and fail_rate:
        print("")
        print("Strict attribution smoke: PASS")
        return 0

    print("")
    print("Strict attribution smoke: FAIL")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
