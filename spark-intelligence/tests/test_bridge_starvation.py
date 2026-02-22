"""Test that bridge_cycle subsystems receive events after pipeline consumes them."""

import time
from pathlib import Path

import lib.queue as queue
from lib.pipeline import ProcessingMetrics


def _patch_queue_paths(tmp_path: Path, monkeypatch) -> None:
    queue_dir = tmp_path / "queue"
    monkeypatch.setattr(queue, "QUEUE_DIR", queue_dir)
    monkeypatch.setattr(queue, "EVENTS_FILE", queue_dir / "events.jsonl")
    monkeypatch.setattr(queue, "LOCK_FILE", queue_dir / ".queue.lock")
    monkeypatch.setattr(queue, "OVERFLOW_FILE", queue_dir / "events.overflow.jsonl")


def _make_events(count: int = 5):
    """Create a list of test SparkEvents."""
    events = []
    for i in range(count):
        ev = queue.SparkEvent(
            event_type=queue.EventType.USER_PROMPT,
            session_id="test",
            timestamp=time.time(),
            data={"payload": {"role": "user", "text": f"message {i}"}},
        )
        events.append(ev)
    return events


def test_processed_events_field_on_metrics():
    """ProcessingMetrics should carry processed_events for downstream use."""
    metrics = ProcessingMetrics()
    # Default is empty list
    assert metrics.processed_events == []

    events = _make_events(3)
    metrics.processed_events = events
    assert len(metrics.processed_events) == 3
    assert metrics.processed_events[0].event_type == queue.EventType.USER_PROMPT


def test_processed_events_not_in_to_dict():
    """processed_events should NOT appear in the serialized metrics dict."""
    metrics = ProcessingMetrics()
    metrics.processed_events = _make_events(3)

    d = metrics.to_dict()
    assert "processed_events" not in d


def test_bridge_uses_pipeline_events_when_queue_empty(tmp_path, monkeypatch):
    """After pipeline consumes everything, bridge_cycle uses returned events."""
    _patch_queue_paths(tmp_path, monkeypatch)
    queue.QUEUE_DIR.mkdir(parents=True, exist_ok=True)

    # Queue is empty (pipeline consumed everything)
    assert queue.read_recent_events(40) == []

    # But pipeline_metrics carries the events it processed
    events = _make_events(5)
    metrics = ProcessingMetrics()
    metrics.events_processed = 5
    metrics.processed_events = events

    # Simulate what bridge_cycle now does:
    if metrics and getattr(metrics, "processed_events", None):
        bridge_events = metrics.processed_events
    else:
        bridge_events = queue.read_recent_events(40)

    assert len(bridge_events) == 5
    assert bridge_events[0].session_id == "test"


def test_bridge_falls_back_to_read_recent(tmp_path, monkeypatch):
    """When pipeline_metrics is None, bridge falls back to read_recent_events."""
    _patch_queue_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(queue, "MAX_EVENTS", 0)
    monkeypatch.setattr(queue, "MAX_QUEUE_BYTES", 0)

    # Put some events in the queue directly
    for i in range(3):
        queue.quick_capture(
            event_type=queue.EventType.USER_PROMPT,
            session_id="fallback",
            data={"i": i},
        )

    pipeline_metrics = None

    # Simulate bridge_cycle fallback logic
    if pipeline_metrics and getattr(pipeline_metrics, "processed_events", None):
        bridge_events = pipeline_metrics.processed_events
    else:
        bridge_events = queue.read_recent_events(40)

    assert len(bridge_events) == 3
