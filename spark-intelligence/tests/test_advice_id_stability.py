from __future__ import annotations

from lib.advisor import SparkAdvisor


def test_generate_advice_id_is_deterministic_for_durable_sources():
    advisor = SparkAdvisor()
    a = advisor._generate_advice_id(
        "Always Read a file before Edit to verify current content",
        insight_key="reasoning:always_read_a_file_before_edit_to_verify",
        source="cognitive",
    )
    b = advisor._generate_advice_id(
        "Always Read a file before Edit to verify current content",
        insight_key="reasoning:always_read_a_file_before_edit_to_verify",
        source="semantic-agentic",  # canonicalized to cognitive
    )
    assert a == "cognitive:reasoning:always_read_a_file_before_edit_to_verify"
    assert b == a


def test_generate_advice_id_normalizes_text_when_no_key():
    advisor = SparkAdvisor()
    a = advisor._generate_advice_id("Run focused TESTS now", source="quick")
    b = advisor._generate_advice_id("  run  focused tests   now  ", source="quick")
    assert a == b
    assert isinstance(a, str)
    assert len(a) == 12

