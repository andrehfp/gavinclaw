from __future__ import annotations

from lib.error_taxonomy import build_error_fields, classify_error_kind


def test_classify_error_kind_priority_order():
    # policy should win over auth when both appear.
    assert classify_error_kind("blocked by policy: 401 token missing") == "policy"


def test_classify_error_kind_mappings():
    assert classify_error_kind("HTTP 401 unauthorized token missing") == "auth"
    assert classify_error_kind("request timeout after 30s") == "timeout"
    assert classify_error_kind("connection refused by upstream") == "transport"
    assert classify_error_kind("no advice available for this tool") == "no_hit"
    assert classify_error_kind("stale index lag detected") == "stale"
    assert classify_error_kind("unexpected issue") == "unknown"


def test_build_error_fields_defaults_and_truncation():
    fields = build_error_fields("x" * 400, "AE_SAMPLE", max_message_chars=64)
    assert fields["error_kind"] == "unknown"
    assert fields["error_code"] == "AE_SAMPLE"
    assert len(fields["error_message"]) == 64

