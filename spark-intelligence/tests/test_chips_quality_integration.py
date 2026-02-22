import json
from pathlib import Path

from lib.advisor import SparkAdvisor
from lib import advisor as advisor_module
from lib.chip_merger import _infer_category
from lib.cognitive_learner import CognitiveCategory
from lib.chips.scoring import InsightScorer


def test_scoring_uniqueness_dedup_works():
    scorer = InsightScorer()
    insight = {"chip_id": "spark-core", "content": "use read before edit for safe changes", "captured_data": {}}
    first = scorer.score(insight)
    second = scorer.score(insight)
    assert first.uniqueness > second.uniqueness


def test_scoring_domain_relevance_covers_core_chips():
    scorer = InsightScorer()
    market = scorer.score(
        {"chip_id": "market-intel", "content": "competitor gap and market opportunity", "captured_data": {}}
    )
    spark_core = scorer.score(
        {"chip_id": "spark-core", "content": "debug fix pattern for tool workflow", "captured_data": {}}
    )
    bench = scorer.score(
        {"chip_id": "bench_core", "content": "benchmark method confidence and outcome coverage", "captured_data": {}}
    )
    assert market.domain_relevance >= 0.6
    assert spark_core.domain_relevance >= 0.6
    assert bench.domain_relevance >= 0.6


def test_chip_merger_category_fallback():
    category_known = _infer_category("bench_core", {}, "benchmark method")
    category_reasoning = _infer_category("unknown_chip", {}, "error failed fix issue")
    category_context = _infer_category("unknown_chip", {}, "audience market customer campaign")
    assert category_known == CognitiveCategory.SELF_AWARENESS
    assert category_reasoning == CognitiveCategory.REASONING
    assert category_context == CognitiveCategory.CONTEXT


def test_advisor_reads_chip_advice(tmp_path):
    chip_dir = tmp_path / "chip_insights"
    chip_dir.mkdir(parents=True, exist_ok=True)
    row = {
        "chip_id": "vibecoding",
        "observer_name": "post_tool_use",
        "content": "Prefer running tests before deploy to catch failures early",
        "confidence": 0.9,
        "captured_data": {"quality_score": {"total": 0.88}},
        "timestamp": "2026-02-06T00:00:00",
    }
    (chip_dir / "vibecoding.jsonl").write_text(json.dumps(row) + "\n", encoding="utf-8")

    old_dir = advisor_module.CHIP_INSIGHTS_DIR
    try:
        advisor_module.CHIP_INSIGHTS_DIR = chip_dir
        advisor = SparkAdvisor()
        advice = advisor._get_chip_advice("deploy tests release")
    finally:
        advisor_module.CHIP_INSIGHTS_DIR = old_dir

    assert advice
    assert advice[0].source == "chip"
    assert "vibecoding" in advice[0].text.lower()
