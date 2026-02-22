"""Tests for SparkEventV1 validation and outcome helpers."""

import json
from pathlib import Path

from lib.events import SparkEventV1, validate_event_dict
from lib.outcome_log import build_explicit_outcome


def test_validate_event_ok():
    data = {
        "v": 1,
        "source": "test",
        "kind": "message",
        "ts": 1700000000.0,
        "session_id": "sess",
        "payload": {"text": "hi"},
    }
    ok, err = validate_event_dict(data, strict=True)
    assert ok is True
    assert err == ""


def test_validate_event_missing_field():
    data = {
        "v": 1,
        "source": "test",
        "kind": "message",
        "ts": 1700000000.0,
        "session_id": "sess",
    }
    ok, err = validate_event_dict(data, strict=True)
    assert ok is False
    assert "missing_payload" in err


def test_validate_event_invalid_kind():
    data = {
        "v": 1,
        "source": "test",
        "kind": "nope",
        "ts": 1700000000.0,
        "session_id": "sess",
        "payload": {},
    }
    ok, err = validate_event_dict(data, strict=True)
    assert ok is False
    assert err == "invalid_kind"


def test_round_trip():
    data = {
        "v": 1,
        "source": "test",
        "kind": "message",
        "ts": 1700000000.0,
        "session_id": "sess",
        "payload": {"text": "hi"},
    }
    ev = SparkEventV1.from_dict(data)
    out = ev.to_dict()
    ok, _ = validate_event_dict(out, strict=True)
    assert ok is True


def test_build_explicit_outcome():
    row, polarity = build_explicit_outcome(result="yes", text="ok")
    assert row["polarity"] == "pos"
    assert polarity == "pos"
    row["linked_insights"] = ["insight:1"]
    assert "linked_insights" in row


def test_adapter_fixtures():
    fixtures = Path("tests/fixtures/adapters")
    ok_files = [
        "claude_code_message.json",
        "claude_code_tool.json",
        "webhook_command.json",
        "scanner_system.json",
    ]
    for name in ok_files:
        data = json.loads((fixtures / name).read_text(encoding="utf-8"))
        ok, err = validate_event_dict(data, strict=True)
        assert ok is True, f"{name} failed: {err}"

    bad = json.loads((fixtures / "invalid_event.json").read_text(encoding="utf-8"))
    ok, _ = validate_event_dict(bad, strict=True)
    assert ok is False
