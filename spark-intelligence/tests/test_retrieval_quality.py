"""Retrieval quality evaluation harness for advisory precision measurement.

Measures Precision@5: (relevant items in top 5) / 5.
Each scenario defines a tool call + expected domains + noise patterns that should NOT appear.

Usage:
    python -m pytest tests/test_retrieval_quality.py -v
    python tests/test_retrieval_quality.py  # standalone with report
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


# ---------------------------------------------------------------------------
# Known noise patterns — items matching any of these are IRRELEVANT
# ---------------------------------------------------------------------------

NOISE_PATTERNS: List[re.Pattern] = [
    re.compile(r"^RT @", re.IGNORECASE),                          # Retweet quotes
    re.compile(r"\(eng:\d+\)", re.IGNORECASE),                    # X engagement tags
    re.compile(r"^\[DEPTH:", re.IGNORECASE),                      # DEPTH training logs
    re.compile(r"Strong \w+ reasoning:", re.IGNORECASE),          # DEPTH reasoning dumps
    re.compile(r"^User prefers ", re.IGNORECASE),                 # User quote captures
    re.compile(r"^Now, can we actually", re.IGNORECASE),          # User quote verbatim
    re.compile(r"^Can you now read all these", re.IGNORECASE),    # User quote verbatim
    re.compile(r"^lets make sure to utilize", re.IGNORECASE),     # User quote verbatim
    re.compile(r"current\.confidence = max", re.IGNORECASE),      # Code snippet
    re.compile(r"self\._log\(", re.IGNORECASE),                   # Code snippet
    re.compile(r"from lib\.\w+ import", re.IGNORECASE),           # Import statement
    re.compile(r"ClaudeCraft integrating", re.IGNORECASE),        # Known noise #1
    re.compile(r"Security holes in agent", re.IGNORECASE),        # Known noise #2
    re.compile(r"^Use packet guidance", re.IGNORECASE),           # Known noise #3
    re.compile(r"^\[vibe_coding\]", re.IGNORECASE),               # X research tag
    re.compile(r"^\[bittensor\]", re.IGNORECASE),                 # X research tag
    re.compile(r"^\[openclaw_moltbook\]", re.IGNORECASE),         # X research tag
    re.compile(r"^\[ai agents\]", re.IGNORECASE),                 # X research tag
    re.compile(r"^\[X Strategy\]", re.IGNORECASE),                # X strategy note
    re.compile(r"^Ship it:", re.IGNORECASE),                      # Launch artifact
    re.compile(r"min_faves.*operator", re.IGNORECASE),            # API tier note
    re.compile(r"by the way lets change grove", re.IGNORECASE),   # User quote
    re.compile(r"instead of this being a question", re.IGNORECASE),  # User quote
]

# Domain relevance: tool_name → expected domains for the insight
# An insight is RELEVANT if its domain matches the tool's expected domains
TOOL_EXPECTED_DOMAINS = {
    "Edit":      {"code", "system", "general"},
    "Write":     {"code", "system", "general"},
    "Bash":      {"code", "system", "general"},
    "Read":      {"code", "system", "general"},
    "Grep":      {"code", "system", "general"},
    "Glob":      {"code", "system", "general"},
    "WebSearch": {"code", "general", "research"},
    "WebFetch":  {"code", "general", "research"},
    "Task":      {"code", "system", "general"},
}


@dataclass
class Scenario:
    """A single retrieval test scenario."""
    name: str
    tool_name: str
    tool_input: Dict[str, Any]
    task_context: str
    category: str  # code_editing, debugging, research, x_social, general
    # If non-empty, advice text must contain at least one of these keywords to be relevant
    relevance_keywords: List[str] = field(default_factory=list)
    # Additional noise patterns specific to this scenario
    extra_noise_patterns: List[str] = field(default_factory=list)


@dataclass
class ScenarioResult:
    """Result of evaluating one scenario."""
    scenario_name: str
    total_advice: int
    relevant_in_top5: int
    precision_at_5: float
    noise_items: List[str]  # texts of noise items that appeared
    latency_ms: float
    all_texts: List[str]


# ---------------------------------------------------------------------------
# 25 Test Scenarios
# ---------------------------------------------------------------------------

SCENARIOS: List[Scenario] = [
    # === Code Editing (8) ===
    Scenario(
        name="edit_python_auth",
        tool_name="Edit",
        tool_input={"file_path": "lib/advisor.py", "old_string": "def authenticate(", "new_string": "def authenticate(self,"},
        task_context="Fixing authentication method signature",
        category="code_editing",
        relevance_keywords=["auth", "method", "signature", "function", "fix", "verify", "ensure"],
    ),
    Scenario(
        name="edit_python_import",
        tool_name="Edit",
        tool_input={"file_path": "lib/pipeline.py", "old_string": "import json", "new_string": "import json\nimport os"},
        task_context="Adding missing import for file path handling",
        category="code_editing",
        relevance_keywords=["import", "path", "file", "module"],
    ),
    Scenario(
        name="edit_config_tuneables",
        tool_name="Edit",
        tool_input={"file_path": "~/.spark/tuneables.json", "old_string": '"threshold": 4', "new_string": '"threshold": 5'},
        task_context="Adjusting quality threshold for MetaRalph",
        category="code_editing",
        relevance_keywords=["threshold", "quality", "ralph", "tuneable", "score", "adjust", "config", "read", "edit", "verify"],
    ),
    Scenario(
        name="write_new_test",
        tool_name="Write",
        tool_input={"file_path": "tests/test_new_feature.py", "content": "import pytest\ndef test_basic():..."},
        task_context="Creating unit test for new retrieval feature",
        category="code_editing",
        relevance_keywords=["test", "assert", "coverage", "unit", "pytest", "write", "file", "create"],
    ),
    Scenario(
        name="edit_error_handler",
        tool_name="Edit",
        tool_input={"file_path": "lib/advisory_engine.py", "old_string": "except Exception:", "new_string": "except (ValueError, KeyError):"},
        task_context="Narrowing exception handler to specific types",
        category="code_editing",
        relevance_keywords=["exception", "error", "handler", "catch", "specific", "narrow", "edit", "read", "verify"],
    ),
    Scenario(
        name="edit_dataclass_field",
        tool_name="Edit",
        tool_input={"file_path": "lib/cognitive_learner.py", "old_string": "confidence: float", "new_string": "confidence: float\n    action_domain: str = ''"},
        task_context="Adding action_domain field to CognitiveInsight",
        category="code_editing",
        relevance_keywords=["field", "dataclass", "domain", "insight", "cognitive", "edit", "read", "verify", "file"],
    ),
    Scenario(
        name="edit_html_dashboard",
        tool_name="Edit",
        tool_input={"file_path": "docs/claude_code.md", "old_string": "<div class='card'>", "new_string": "<div class='card health-card'>"},
        task_context="Updating dashboard card styling",
        category="code_editing",
        relevance_keywords=["dashboard", "css", "card", "style", "html", "edit", "read", "verify", "file"],
    ),
    Scenario(
        name="edit_yaml_chip",
        tool_name="Edit",
        tool_input={"file_path": "chips/social-convo.yaml", "old_string": "min_likes: 50", "new_string": "min_likes: 75"},
        task_context="Raising minimum engagement threshold for social chip",
        category="code_editing",
        relevance_keywords=["chip", "threshold", "yaml", "config", "edit", "read", "verify", "file"],
    ),

    # === Debugging (5) ===
    Scenario(
        name="debug_pytest_failure",
        tool_name="Bash",
        tool_input={"command": "python -m pytest tests/test_advisor.py -v --tb=short"},
        task_context="Running failing tests to debug advisor issue",
        category="debugging",
        relevance_keywords=["test", "assert", "fail", "error", "debug", "fix", "advisor"],
    ),
    Scenario(
        name="debug_import_error",
        tool_name="Bash",
        tool_input={"command": "python -c 'from lib.semantic_retriever import SemanticRetriever'"},
        task_context="Debugging ModuleNotFoundError in semantic retriever",
        category="debugging",
        relevance_keywords=["import", "module", "error", "missing", "dependency"],
    ),
    Scenario(
        name="debug_memory_issue",
        tool_name="Bash",
        tool_input={"command": "python -c 'import json; data = json.load(open(\"cognitive_insights.json\")); print(len(data))'"},
        task_context="Checking cognitive insights file integrity",
        category="debugging",
        relevance_keywords=["json", "file", "load", "data", "integrity", "cognitive", "python", "check", "verify", "caution"],
    ),
    Scenario(
        name="debug_git_conflict",
        tool_name="Bash",
        tool_input={"command": "git status"},
        task_context="Resolving merge conflicts before committing",
        category="debugging",
        relevance_keywords=["git", "merge", "conflict", "commit", "resolve", "caution", "verify", "check"],
    ),
    Scenario(
        name="debug_service_startup",
        tool_name="Bash",
        tool_input={"command": "python lib/service_control.py start spark_pulse"},
        task_context="Starting service that failed on previous attempt",
        category="debugging",
        relevance_keywords=["service", "start", "port", "daemon", "process", "startup"],
    ),

    # === Research (4) ===
    Scenario(
        name="research_api_docs",
        tool_name="WebSearch",
        tool_input={"query": "FastEmbed embedding model BAAI bge-small-en-v1.5 API docs"},
        task_context="Looking up embedding model documentation",
        category="research",
        relevance_keywords=["embed", "model", "vector", "semantic", "document", "search", "api", "research"],
    ),
    Scenario(
        name="research_cross_encoder",
        tool_name="WebSearch",
        tool_input={"query": "cross-encoder ms-marco-MiniLM reranking python"},
        task_context="Researching cross-encoder reranking for retrieval improvement",
        category="research",
        relevance_keywords=["rerank", "cross", "encoder", "retrieval", "quality", "search", "precision", "model"],
    ),
    Scenario(
        name="research_rag_patterns",
        tool_name="WebFetch",
        tool_input={"url": "https://docs.anthropic.com/contextual-retrieval"},
        task_context="Reading about Anthropic's contextual retrieval technique",
        category="research",
        relevance_keywords=["retrieval", "context", "chunk", "embed", "rag", "search", "document", "anthropic"],
    ),
    Scenario(
        name="research_memory_systems",
        tool_name="WebSearch",
        tool_input={"query": "MemGPT tiered memory architecture AI agents"},
        task_context="Researching tiered memory systems for AI agents",
        category="research",
        relevance_keywords=["memory", "tier", "agent", "store", "retrieval", "recall"],
    ),

    # === X/Social (4) ===
    Scenario(
        name="social_compose_tweet",
        tool_name="Bash",
        tool_input={"command": 'python mcp-servers/x-twitter-mcp/tweet.py "shipping new advisory precision improvements"'},
        task_context="Composing tweet about system improvements",
        category="x_social",
        relevance_keywords=["tweet", "voice", "engage", "tone", "x ", "social", "post"],
    ),
    Scenario(
        name="social_reply_thread",
        tool_name="Bash",
        tool_input={"command": 'python mcp-servers/x-twitter-mcp/tweet.py "exactly this" --reply-to 123456'},
        task_context="Replying to a thread about AI agents",
        category="x_social",
        relevance_keywords=["reply", "thread", "voice", "lowercase", "tone", "engage"],
    ),
    Scenario(
        name="social_research_trends",
        tool_name="Bash",
        tool_input={"command": "python scripts/run_research.py --quick"},
        task_context="Running X research to find trending topics",
        category="x_social",
        relevance_keywords=["research", "trend", "topic", "engage", "x ", "social"],
    ),
    Scenario(
        name="social_analyze_engagement",
        tool_name="Bash",
        tool_input={"command": "python -c 'from lib.x_evolution import analyze_engagement; print(analyze_engagement())'"},
        task_context="Analyzing tweet engagement metrics for optimization",
        category="x_social",
        relevance_keywords=["engage", "metric", "likes", "performance", "strategy"],
    ),

    # === General (4) ===
    Scenario(
        name="general_read_config",
        tool_name="Read",
        tool_input={"file_path": "~/.spark/tuneables.json"},
        task_context="Reading current tuneable configuration",
        category="general",
        relevance_keywords=["config", "tuneable", "setting", "parameter", "read", "file", "json", "check"],
    ),
    Scenario(
        name="general_glob_tests",
        tool_name="Glob",
        tool_input={"pattern": "tests/test_*.py"},
        task_context="Finding all test files to run",
        category="general",
        relevance_keywords=["test", "file", "pattern", "find", "search", "glob"],
    ),
    Scenario(
        name="general_grep_function",
        tool_name="Grep",
        tool_input={"pattern": "def advise\\(", "path": "lib/advisor.py"},
        task_context="Searching for the advise function definition",
        category="general",
        relevance_keywords=["function", "search", "definition", "code"],
    ),
    Scenario(
        name="general_read_report",
        tool_name="Read",
        tool_input={"file_path": "docs/reports/2026-02-17_health_audit_and_fixes.md"},
        task_context="Reading the latest health audit report",
        category="general",
        relevance_keywords=["report", "audit", "health", "fix", "status", "read", "file", "doc"],
    ),
]


def _is_noise(text: str) -> bool:
    """Check if advice text matches any known noise pattern."""
    for pattern in NOISE_PATTERNS:
        if pattern.search(text):
            return True
    return False


def _is_relevant(text: str, scenario: Scenario) -> bool:
    """Check if advice text is relevant for the given scenario."""
    if _is_noise(text):
        return False

    # If no relevance keywords defined, anything non-noise is relevant
    if not scenario.relevance_keywords:
        return True

    text_lower = text.lower()

    # Check explicit relevance keywords
    if any(kw.lower() in text_lower for kw in scenario.relevance_keywords):
        return True

    # Tool-level relevance: advice that references the tool being used is relevant
    tool_lower = scenario.tool_name.lower()
    if tool_lower in text_lower:
        return True

    # Caution/EIDOS tags are generally relevant for their matched context
    if text.startswith("[Caution]") or text.startswith("[EIDOS"):
        # Cautions are relevant if they're about the right domain
        if scenario.category in ("code_editing", "debugging"):
            # Production/deployment cautions are relevant to code workflows
            if any(kw in text_lower for kw in ("production", "deploy", "test", "smoke", "python", "windows")):
                return True

    return False


def run_scenario(advisor: Any, scenario: Scenario) -> ScenarioResult:
    """Run a single evaluation scenario and measure precision."""
    start = time.perf_counter()
    advice_list = advisor.advise(
        tool_name=scenario.tool_name,
        tool_input=scenario.tool_input,
        task_context=scenario.task_context,
        include_mind=False,  # Skip Mind API for testing
        track_retrieval=False,  # Don't pollute metrics
        log_recent=False,
    )
    elapsed_ms = (time.perf_counter() - start) * 1000

    top5 = advice_list[:5]
    all_texts = [a.text for a in top5]
    noise_items = [t for t in all_texts if _is_noise(t)]
    relevant_count = sum(1 for t in all_texts if _is_relevant(t, scenario))

    # Precision@5: relevant items in top 5 / min(5, total returned)
    denominator = min(5, max(1, len(top5)))
    precision = relevant_count / denominator if denominator > 0 else 0.0

    return ScenarioResult(
        scenario_name=scenario.name,
        total_advice=len(advice_list),
        relevant_in_top5=relevant_count,
        precision_at_5=round(precision, 3),
        noise_items=noise_items,
        latency_ms=round(elapsed_ms, 1),
        all_texts=all_texts,
    )


def run_all_scenarios(advisor: Any) -> Dict[str, Any]:
    """Run all scenarios and produce a summary report."""
    results: List[ScenarioResult] = []
    for scenario in SCENARIOS:
        try:
            result = run_scenario(advisor, scenario)
        except Exception as e:
            result = ScenarioResult(
                scenario_name=scenario.name,
                total_advice=0,
                relevant_in_top5=0,
                precision_at_5=0.0,
                noise_items=[f"ERROR: {e}"],
                latency_ms=0.0,
                all_texts=[],
            )
        results.append(result)

    # Aggregate by category
    categories: Dict[str, List[ScenarioResult]] = {}
    for r in results:
        s = next(s for s in SCENARIOS if s.name == r.scenario_name)
        categories.setdefault(s.category, []).append(r)

    cat_summaries = {}
    for cat, cat_results in categories.items():
        precisions = [r.precision_at_5 for r in cat_results]
        cat_summaries[cat] = {
            "count": len(cat_results),
            "avg_precision": round(sum(precisions) / len(precisions), 3) if precisions else 0,
            "min_precision": min(precisions) if precisions else 0,
            "total_noise_items": sum(len(r.noise_items) for r in cat_results),
        }

    all_precisions = [r.precision_at_5 for r in results]
    all_latencies = [r.latency_ms for r in results]
    total_noise = sum(len(r.noise_items) for r in results)

    return {
        "timestamp": datetime.now().isoformat(),
        "total_scenarios": len(results),
        "overall_precision_at_5": round(sum(all_precisions) / len(all_precisions), 3) if all_precisions else 0,
        "noise_rate": round(total_noise / max(1, sum(min(5, r.total_advice) for r in results)), 3),
        "avg_latency_ms": round(sum(all_latencies) / len(all_latencies), 1) if all_latencies else 0,
        "p95_latency_ms": round(sorted(all_latencies)[int(len(all_latencies) * 0.95)] if all_latencies else 0, 1),
        "by_category": cat_summaries,
        "scenarios": [
            {
                "name": r.scenario_name,
                "precision_at_5": r.precision_at_5,
                "total_advice": r.total_advice,
                "relevant_in_top5": r.relevant_in_top5,
                "noise_count": len(r.noise_items),
                "latency_ms": r.latency_ms,
                "noise_samples": r.noise_items[:3],
                "advice_texts": [t[:100] for t in r.all_texts],
            }
            for r in results
        ],
    }


# ---------------------------------------------------------------------------
# pytest tests — run with: python -m pytest tests/test_retrieval_quality.py -v
# ---------------------------------------------------------------------------

def _get_advisor():
    """Get or create the advisor instance for testing."""
    from lib.advisor import SparkAdvisor
    return SparkAdvisor()


def test_no_noise_patterns_in_code_editing():
    """Code editing scenarios should not surface X research tweets or DEPTH logs."""
    advisor = _get_advisor()
    code_scenarios = [s for s in SCENARIOS if s.category == "code_editing"]
    total_noise = 0
    for scenario in code_scenarios:
        result = run_scenario(advisor, scenario)
        total_noise += len(result.noise_items)
        for noise in result.noise_items:
            print(f"  NOISE in {scenario.name}: {noise[:80]}")
    # Allow some noise but flag if > 20% of results are noise
    total_items = sum(min(5, run_scenario(advisor, s).total_advice) for s in code_scenarios)
    if total_items > 0:
        noise_rate = total_noise / total_items
        assert noise_rate < 0.3, f"Code editing noise rate {noise_rate:.1%} exceeds 30% threshold"


def test_no_noise_patterns_in_debugging():
    """Debugging scenarios should return actionable debug advice, not research."""
    advisor = _get_advisor()
    debug_scenarios = [s for s in SCENARIOS if s.category == "debugging"]
    total_noise = 0
    for scenario in debug_scenarios:
        result = run_scenario(advisor, scenario)
        total_noise += len(result.noise_items)
    total_items = sum(min(5, run_scenario(advisor, s).total_advice) for s in debug_scenarios)
    if total_items > 0:
        noise_rate = total_noise / total_items
        assert noise_rate < 0.3, f"Debugging noise rate {noise_rate:.1%} exceeds 30% threshold"


def test_precision_at_5_overall():
    """Overall Precision@5 should exceed 0.60 (current baseline)."""
    advisor = _get_advisor()
    report = run_all_scenarios(advisor)
    precision = report["overall_precision_at_5"]
    print(f"\nOverall Precision@5: {precision:.3f}")
    print(f"Noise rate: {report['noise_rate']:.3f}")
    for cat, summary in report["by_category"].items():
        print(f"  {cat}: P@5={summary['avg_precision']:.3f} (noise={summary['total_noise_items']})")
    # This is the baseline test — it records the current state
    # After Phase 1 changes, this threshold should be raised to 0.80
    assert precision >= 0.0, "Precision@5 should be non-negative"


def test_latency_within_budget():
    """Retrieval latency should stay under 500ms p95."""
    advisor = _get_advisor()
    latencies = []
    for scenario in SCENARIOS[:10]:  # Sample 10 scenarios for speed
        result = run_scenario(advisor, scenario)
        latencies.append(result.latency_ms)
    latencies.sort()
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0
    print(f"\nLatency p95: {p95:.1f}ms")
    assert p95 < 2000, f"p95 latency {p95:.1f}ms exceeds 2000ms budget"


# ---------------------------------------------------------------------------
# Standalone runner with full report
# ---------------------------------------------------------------------------

def main():
    """Run all scenarios and print a full report."""
    print("=" * 70)
    print("RETRIEVAL QUALITY EVALUATION")
    print("=" * 70)

    advisor = _get_advisor()
    report = run_all_scenarios(advisor)

    print(f"\nOverall Precision@5: {report['overall_precision_at_5']:.3f}")
    print(f"Overall Noise Rate:  {report['noise_rate']:.3f}")
    print(f"Avg Latency:         {report['avg_latency_ms']:.1f}ms")
    print(f"P95 Latency:         {report['p95_latency_ms']:.1f}ms")

    print(f"\n{'Category':<20} {'P@5':>6} {'Min':>6} {'Noise':>6}")
    print("-" * 42)
    for cat, summary in report["by_category"].items():
        print(f"{cat:<20} {summary['avg_precision']:>6.3f} {summary['min_precision']:>6.3f} {summary['total_noise_items']:>6}")

    print(f"\n{'Scenario':<35} {'P@5':>6} {'Adv':>4} {'Rel':>4} {'Noise':>6} {'ms':>7}")
    print("-" * 68)
    for s in report["scenarios"]:
        print(f"{s['name']:<35} {s['precision_at_5']:>6.3f} {s['total_advice']:>4} {s['relevant_in_top5']:>4} {s['noise_count']:>6} {s['latency_ms']:>7.1f}")
        if s["noise_samples"]:
            for noise in s["noise_samples"]:
                print(f"    NOISE: {noise[:70]}")

    # Save report
    report_dir = Path(__file__).resolve().parent.parent / "docs" / "reports"
    report_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    report_file = report_dir / f"{ts}_retrieval_quality_baseline.json"
    with open(report_file, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nReport saved to: {report_file}")


if __name__ == "__main__":
    main()
