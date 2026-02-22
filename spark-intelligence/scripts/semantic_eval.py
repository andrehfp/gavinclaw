#!/usr/bin/env python3
"""Semantic Retrieval Evaluation Environment for Meta-Ralph Iteration.

Runs scored test cases against the advisor pipeline, measures quality,
and feeds outcomes into Meta-Ralph so it can learn which tuneables work.

Usage:
    python scripts/semantic_eval.py                  # Run evaluation
    python scripts/semantic_eval.py --tune           # Run + auto-tune thresholds
    python scripts/semantic_eval.py --sweep           # Grid sweep of tuneables
    python scripts/semantic_eval.py --report          # Just print latest results
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

EVAL_DIR = Path.home() / ".spark" / "eval"
EVAL_RESULTS = EVAL_DIR / "semantic_eval_results.jsonl"
EVAL_SUMMARY = EVAL_DIR / "semantic_eval_summary.json"
TUNEABLES_PATH = Path.home() / ".spark" / "tuneables.json"


# =============================================================================
# TEST CASES: Each defines a scenario with expected outcomes
# =============================================================================

@dataclass
class TestCase:
    """A scored test case for semantic retrieval evaluation."""
    name: str
    tool: str
    tool_input: Dict[str, str]
    context: str
    # Expected outcomes
    expect_triggers: List[str] = field(default_factory=list)   # trigger rule names
    expect_no_triggers: bool = False                            # expect zero triggers
    expect_sources: List[str] = field(default_factory=list)     # expected source types
    reject_patterns: List[str] = field(default_factory=list)    # text that MUST NOT appear
    require_patterns: List[str] = field(default_factory=list)   # text that MUST appear
    max_items: Optional[int] = None                             # advice should not exceed
    min_items: Optional[int] = None                             # advice should have at least
    # Relevance keywords: at least one must appear in each non-trigger result
    # for it to count as "relevant". Precision = relevant / total non-trigger.
    relevance_keywords: List[str] = field(default_factory=list)
    min_precision: float = 0.0  # fraction of non-trigger advice that must be relevant


# The canonical test suite
TEST_CASES = [
    # --- Trigger tests ---
    TestCase(
        name="auth_trigger",
        tool="Edit",
        tool_input={"file_path": "src/auth/login.py"},
        context="edit auth login flow",
        expect_triggers=["auth_security"],
        require_patterns=["server-side", "secrets"],
    ),
    TestCase(
        name="destructive_trigger",
        tool="Bash",
        tool_input={"command": "rm -rf /tmp/build"},
        context="cleanup build directory",
        expect_triggers=["destructive_commands"],
        require_patterns=["destructive", "dry-run"],
    ),
    TestCase(
        name="deploy_trigger",
        tool="Bash",
        tool_input={"command": "git push origin main"},
        context="ship the release",
        expect_triggers=["deployment"],
        require_patterns=["tests", "migrations"],
    ),
    TestCase(
        name="benign_no_trigger",
        tool="Read",
        tool_input={"file_path": "README.md"},
        context="read readme for context",
        expect_no_triggers=True,
    ),
    # --- Noise rejection tests ---
    TestCase(
        name="no_task_notifications",
        tool="Edit",
        tool_input={"file_path": "app.py"},
        context="refactor application entry point",
        reject_patterns=["<task-notification>", "<task-id>", "<output-file>"],
    ),
    TestCase(
        name="no_garbled_prefs",
        tool="Bash",
        tool_input={"command": "npm install"},
        context="install dependencies",
        reject_patterns=["' over '"],  # garbled user prefs pattern
    ),
    TestCase(
        name="no_benchmark_artifacts",
        tool="Read",
        tool_input={"file_path": "config.json"},
        context="check configuration",
        reject_patterns=["status=success, tool_name=", "status: success, tool_name:"],
    ),
    # --- Relevance tests ---
    TestCase(
        name="eidos_scoped",
        tool="Read",
        tool_input={"file_path": "README.md"},
        context="read readme for context",
        reject_patterns=["git push origin main"],  # EIDOS should NOT leak here
    ),
    TestCase(
        name="eidos_relevant",
        tool="Bash",
        tool_input={"command": "git push origin main"},
        context="push code to repo",
        expect_sources=["trigger", "eidos"],
    ),
    # --- Precision / relevance tests ---
    # These check that non-trigger advice items are actually relevant to the task
    TestCase(
        name="auth_precision",
        tool="Edit",
        tool_input={"file_path": "src/auth/login.py"},
        context="edit auth login flow",
        relevance_keywords=["auth", "login", "token", "session", "password", "jwt",
                            "secur", "validat", "credential", "oauth"],
        min_precision=0.3,
    ),
    TestCase(
        name="deploy_precision",
        tool="Bash",
        tool_input={"command": "git push origin main"},
        context="ship the release",
        relevance_keywords=["deploy", "push", "release", "git", "test", "migrat",
                            "prod", "merge", "ci", "pipeline", "ship"],
        min_precision=0.3,
    ),
    TestCase(
        name="game_physics_precision",
        tool="Edit",
        tool_input={"file_path": "src/game/physics.js"},
        context="fix game physics jitter",
        relevance_keywords=["physics", "game", "jitter", "cannon", "gravity", "collision",
                            "frame", "delta", "velocity", "update", "tick", "render"],
        min_precision=0.2,
    ),
    TestCase(
        name="database_precision",
        tool="Bash",
        tool_input={"command": "python manage.py migrate"},
        context="run database migration",
        relevance_keywords=["database", "migrat", "sql", "schema", "model", "table",
                            "query", "postgres", "sqlite", "orm", "data"],
        min_precision=0.2,
    ),
    # --- Quality bounds ---
    TestCase(
        name="reasonable_count",
        tool="Bash",
        tool_input={"command": "python -m pytest"},
        context="run tests",
        min_items=1,
        max_items=8,
    ),
    # --- Cross-domain contamination test ---
    TestCase(
        name="no_cross_contamination",
        tool="Edit",
        tool_input={"file_path": "styles/theme.css"},
        context="update CSS theme colors",
        reject_patterns=["git push", "database", "migration", "deploy"],
        relevance_keywords=["css", "theme", "color", "style", "design", "ui",
                            "visual", "dark", "layout", "brand"],
        min_precision=0.1,
    ),
]


# =============================================================================
# EVALUATOR
# =============================================================================

@dataclass
class CaseResult:
    name: str
    passed: bool
    score: float  # 0.0 to 1.0
    failures: List[str] = field(default_factory=list)
    advice_count: int = 0
    trigger_count: int = 0
    sources: List[str] = field(default_factory=list)
    elapsed_ms: int = 0
    precision: Optional[float] = None  # fraction of non-trigger items that are relevant


def evaluate_case(tc: TestCase, track: bool = False) -> CaseResult:
    """Run a single test case and score it."""
    from lib.advisor import advise_on_tool, get_advisor

    # Clear cache
    advisor = get_advisor()
    advisor._advice_cache = {}

    t0 = time.time()
    advice = advise_on_tool(
        tc.tool, tc.tool_input, tc.context, trace_id=None,
    )
    elapsed = int((time.time() - t0) * 1000)

    failures: List[str] = []
    all_text = " ".join(a.text for a in advice).lower()
    sources = [a.source for a in advice]
    triggers = [a for a in advice if a.source == "trigger"]

    # Check trigger expectations
    if tc.expect_triggers:
        for trig in tc.expect_triggers:
            trigger_texts = " ".join(a.reason for a in triggers).lower()
            if trig.lower() not in trigger_texts:
                failures.append(f"missing trigger: {trig}")

    if tc.expect_no_triggers and triggers:
        failures.append(f"unexpected {len(triggers)} trigger(s): {[a.reason for a in triggers]}")

    # Check source expectations
    if tc.expect_sources:
        for src in tc.expect_sources:
            if src not in sources:
                failures.append(f"missing source: {src}")

    # Check reject patterns
    for pat in tc.reject_patterns:
        if pat.lower() in all_text:
            failures.append(f"rejected pattern found: '{pat}'")

    # Check require patterns
    for pat in tc.require_patterns:
        if pat.lower() not in all_text:
            failures.append(f"required pattern missing: '{pat}'")

    # Check count bounds
    if tc.max_items is not None and len(advice) > tc.max_items:
        failures.append(f"too many items: {len(advice)} > {tc.max_items}")
    if tc.min_items is not None and len(advice) < tc.min_items:
        failures.append(f"too few items: {len(advice)} < {tc.min_items}")

    # Precision: what fraction of non-trigger results contain relevance keywords?
    precision = None
    if tc.relevance_keywords:
        non_trigger = [a for a in advice if a.source != "trigger"]
        if non_trigger:
            relevant = 0
            kws = [kw.lower() for kw in tc.relevance_keywords]
            for a in non_trigger:
                text_lower = a.text.lower()
                if any(kw in text_lower for kw in kws):
                    relevant += 1
            precision = relevant / len(non_trigger)
            if tc.min_precision > 0 and precision < tc.min_precision:
                failures.append(
                    f"low precision: {precision:.0%} < {tc.min_precision:.0%} "
                    f"({relevant}/{len(non_trigger)} relevant)"
                )

    passed = len(failures) == 0
    # Score: blend pass/fail (0.6 weight) with precision (0.4 weight)
    base_score = max(0.0, 1.0 - (len(failures) * 0.25))
    if precision is not None:
        score = base_score * 0.6 + precision * 0.4
    else:
        score = base_score

    return CaseResult(
        name=tc.name,
        passed=passed,
        score=score,
        failures=failures,
        advice_count=len(advice),
        trigger_count=len(triggers),
        sources=list(set(sources)),
        elapsed_ms=elapsed,
        precision=precision,
    )


def run_evaluation(cases: Optional[List[TestCase]] = None, track: bool = True) -> Dict[str, Any]:
    """Run the full evaluation suite and return summary."""
    cases = cases or TEST_CASES
    results: List[CaseResult] = []

    for tc in cases:
        result = evaluate_case(tc, track=track)
        results.append(result)

    # Compute aggregate metrics
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    avg_score = sum(r.score for r in results) / max(total, 1)
    avg_latency = sum(r.elapsed_ms for r in results) / max(total, 1)

    # Categorize
    trigger_cases = [r for r in results if any("trigger" in f for f in [r.name])]

    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_cases": total,
        "passed": passed,
        "failed": total - passed,
        "pass_rate": round(passed / max(total, 1), 4),
        "avg_score": round(avg_score, 4),
        "avg_latency_ms": round(avg_latency),
        "results": [asdict(r) for r in results],
        "failures": {r.name: r.failures for r in results if not r.passed},
    }

    return summary


def report_to_meta_ralph(summary: Dict[str, Any]) -> None:
    """Feed evaluation results into Meta-Ralph for learning."""
    try:
        from lib.meta_ralph import get_meta_ralph
        ralph = get_meta_ralph()

        for result in summary["results"]:
            outcome = "good" if result["passed"] else "bad"
            evidence = f"eval:{result['name']} score={result['score']:.2f}"
            if result["failures"]:
                evidence += f" failures={result['failures']}"
            ralph.track_outcome(
                f"eval:{result['name']}",
                outcome,
                evidence,
            )
    except Exception as e:
        print(f"  [warn] Meta-Ralph feedback failed: {e}")


def save_results(summary: Dict[str, Any]) -> None:
    """Persist evaluation results for trend tracking."""
    EVAL_DIR.mkdir(parents=True, exist_ok=True)

    # Append to history
    with open(EVAL_RESULTS, "a", encoding="utf-8") as f:
        f.write(json.dumps(summary) + "\n")

    # Update latest summary
    EVAL_SUMMARY.write_text(json.dumps(summary, indent=2), encoding="utf-8")


# =============================================================================
# AUTO-TUNER: Tries threshold adjustments and picks the best
# =============================================================================

def load_tuneables() -> Dict[str, Any]:
    if TUNEABLES_PATH.exists():
        return json.loads(TUNEABLES_PATH.read_text(encoding="utf-8"))
    return {}


def save_tuneables(data: Dict[str, Any]) -> None:
    TUNEABLES_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def sweep_tuneables() -> Dict[str, Any]:
    """Grid sweep of key semantic tuneables, return best config.

    Always restores original tuneables after sweep. Only prints
    recommendations — does NOT auto-apply.
    """
    original = load_tuneables()
    best_score = 0.0
    best_params = None
    sweep_results = []

    param_grid = {
        "min_similarity": [0.55, 0.60, 0.65, 0.68, 0.72],
        "min_fusion_score": [0.50, 0.55, 0.60, 0.65, 0.70],
    }

    # Test all combinations
    from itertools import product
    keys = list(param_grid.keys())
    try:
        for values in product(*[param_grid[k] for k in keys]):
            config = copy.deepcopy(original)
            for k, v in zip(keys, values):
                config.setdefault("semantic", {})[k] = v

            save_tuneables(config)
            _reset_retriever()

            summary = run_evaluation(track=False)
            entry = {
                "params": {k: v for k, v in zip(keys, values)},
                "pass_rate": summary["pass_rate"],
                "avg_score": summary["avg_score"],
                "avg_latency_ms": summary["avg_latency_ms"],
            }
            sweep_results.append(entry)

            if summary["avg_score"] > best_score:
                best_score = summary["avg_score"]
                best_params = dict(zip(keys, values))

            print(f"  {dict(zip(keys, values))} -> pass={summary['pass_rate']:.0%} score={summary['avg_score']:.3f}")
    finally:
        # Always restore original tuneables
        save_tuneables(original)
        _reset_retriever()

    if best_params:
        print(f"\nBest config (score={best_score:.3f}):")
        for k, v in best_params.items():
            cur = original.get("semantic", {}).get(k, "?")
            print(f"  {k}: {cur} -> {v}")
        print("  (original tuneables preserved — apply manually if desired)")

    return {"sweep_results": sweep_results, "best_score": best_score, "best_params": best_params}


def auto_tune(summary: Dict[str, Any]) -> None:
    """Simple auto-tune: if failures involve thresholds, adjust."""
    tuneables = load_tuneables()
    semantic = tuneables.setdefault("semantic", {})
    changed = False

    failures = summary.get("failures", {})

    # If too many items, raise fusion score
    for name, fails in failures.items():
        for f in fails:
            if "too many items" in f:
                old = semantic.get("min_fusion_score", 0.5)
                semantic["min_fusion_score"] = round(min(0.8, old + 0.05), 2)
                print(f"  [tune] min_fusion_score: {old} -> {semantic['min_fusion_score']}")
                changed = True
            if "too few items" in f:
                old = semantic.get("min_fusion_score", 0.5)
                semantic["min_fusion_score"] = round(max(0.3, old - 0.05), 2)
                print(f"  [tune] min_fusion_score: {old} -> {semantic['min_fusion_score']}")
                changed = True

    if changed:
        save_tuneables(tuneables)
        _reset_retriever()


def _reset_retriever():
    """Force re-initialization of cached retriever instances."""
    try:
        from lib.semantic_retriever import SemanticRetriever
        # Clear module-level cache if any
        import lib.semantic_retriever as sr
        if hasattr(sr, "_INSTANCE"):
            sr._INSTANCE = None
        if hasattr(sr, "_singleton"):
            sr._singleton = None
    except Exception:
        pass
    try:
        from lib.advisor import get_advisor
        from lib.cognitive_learner import CognitiveLearner
        advisor = get_advisor()
        advisor._advice_cache = {}
        # Reload cognitive learner so latest noise rules take effect
        advisor.cognitive = CognitiveLearner()
    except Exception:
        pass


# =============================================================================
# CLI
# =============================================================================

def print_summary(summary: Dict[str, Any]) -> None:
    total = summary["total_cases"]
    passed = summary["passed"]
    failed = summary["failed"]
    avg = summary["avg_score"]
    lat = summary["avg_latency_ms"]

    status = "PASS" if failed == 0 else "FAIL"
    print(f"\n{'=' * 60}")
    print(f" SEMANTIC EVAL: {status}  {passed}/{total} passed  score={avg:.3f}  latency={lat}ms")
    print(f"{'=' * 60}")

    for r in summary["results"]:
        mark = "PASS" if r["passed"] else "FAIL"
        prec_str = f" prec={r['precision']:.0%}" if r.get("precision") is not None else ""
        print(f"  [{mark}] {r['name']:30s}  items={r['advice_count']} triggers={r['trigger_count']}{prec_str} {r['elapsed_ms']}ms")
        for f in r.get("failures", []):
            print(f"         -> {f}")

    if summary["failures"]:
        print(f"\n  {failed} failure(s) need attention.")
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description="Semantic retrieval evaluation for Meta-Ralph")
    ap.add_argument("--tune", action="store_true", help="Auto-tune thresholds after evaluation")
    ap.add_argument("--sweep", action="store_true", help="Grid sweep of tuneables")
    ap.add_argument("--report", action="store_true", help="Show latest results only")
    ap.add_argument("--no-ralph", action="store_true", help="Skip Meta-Ralph feedback")
    args = ap.parse_args()

    if args.report:
        if EVAL_SUMMARY.exists():
            summary = json.loads(EVAL_SUMMARY.read_text())
            print_summary(summary)
        else:
            print("No evaluation results found. Run without --report first.")
        return 0

    # Ensure fresh advisor state with latest noise rules
    _reset_retriever()

    if args.sweep:
        print("Sweeping tuneables...\n")
        sweep_result = sweep_tuneables()
        # Run final eval with best config
        print("\nFinal evaluation with best config:")
        summary = run_evaluation(track=True)
        print_summary(summary)
        save_results(summary)
        if not args.no_ralph:
            report_to_meta_ralph(summary)
        return 0 if summary["failed"] == 0 else 1

    # Standard evaluation
    summary = run_evaluation(track=True)
    print_summary(summary)
    save_results(summary)

    if not args.no_ralph:
        report_to_meta_ralph(summary)

    if args.tune:
        print("Auto-tuning based on results...")
        auto_tune(summary)
        # Re-run after tuning
        print("\nRe-evaluation after tuning:")
        summary2 = run_evaluation(track=True)
        print_summary(summary2)
        save_results(summary2)
        if not args.no_ralph:
            report_to_meta_ralph(summary2)
        return 0 if summary2["failed"] == 0 else 1

    return 0 if summary["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
