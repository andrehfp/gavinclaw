"""
Tests for Validation Loop v1 (preferences + communication).

Run with: python -m pytest tests/test_validation_loop.py -v
"""

import pytest


def _setup_env(tmp_path, monkeypatch):
    # Queue paths
    from lib import queue as q
    monkeypatch.setattr(q, "QUEUE_DIR", tmp_path / "queue")
    monkeypatch.setattr(q, "EVENTS_FILE", tmp_path / "queue" / "events.jsonl")
    monkeypatch.setattr(q, "LOCK_FILE", tmp_path / "queue" / ".queue.lock")

    # Cognitive insights storage
    from lib import cognitive_learner as cl
    monkeypatch.setattr(cl.CognitiveLearner, "INSIGHTS_FILE", tmp_path / "cognitive_insights.json")
    cl._cognitive_learner = None

    # Validation loop state
    from lib import validation_loop as vl
    monkeypatch.setattr(vl, "STATE_FILE", tmp_path / "validation_state.json")

    # Aha tracker storage
    from lib import aha_tracker as ah
    monkeypatch.setattr(ah, "AHA_FILE", tmp_path / "aha_moments.json")
    ah._tracker = None

    return q, cl, vl


def _find_insight(cog, needle: str):
    for ins in cog.insights.values():
        if needle.lower() in (ins.insight or "").lower():
            return ins
    return None


def test_validation_positive_preference(tmp_path, monkeypatch):
    q, cl, vl = _setup_env(tmp_path, monkeypatch)

    cog = cl.get_cognitive_learner()
    cog.add_insight(
        category=cl.CognitiveCategory.USER_UNDERSTANDING,
        insight="User prefers TypeScript for new files",
        context="When writing code",
        confidence=0.6,
    )

    q.quick_capture(
        q.EventType.USER_PROMPT,
        session_id="s1",
        data={"payload": {"role": "user", "text": "Please use TypeScript for this file."}},
    )

    stats = vl.process_validation_events(limit=10)
    assert stats["validated"] == 1
    assert stats["contradicted"] == 0

    ins = _find_insight(cog, "TypeScript")
    assert ins is not None
    assert ins.times_validated == 1


def test_validation_contradiction_preference(tmp_path, monkeypatch):
    q, cl, vl = _setup_env(tmp_path, monkeypatch)

    cog = cl.get_cognitive_learner()
    cog.add_insight(
        category=cl.CognitiveCategory.USER_UNDERSTANDING,
        insight="User prefers dark theme",
        context="UI style",
        confidence=0.7,
    )

    q.quick_capture(
        q.EventType.USER_PROMPT,
        session_id="s2",
        data={"payload": {"role": "user", "text": "Please do NOT use dark theme."}},
    )

    stats = vl.process_validation_events(limit=10)
    assert stats["validated"] == 0
    assert stats["contradicted"] == 1

    ins = _find_insight(cog, "dark theme")
    assert ins is not None
    assert ins.times_contradicted == 1


def test_validation_no_match(tmp_path, monkeypatch):
    q, cl, vl = _setup_env(tmp_path, monkeypatch)

    cog = cl.get_cognitive_learner()
    cog.add_insight(
        category=cl.CognitiveCategory.USER_UNDERSTANDING,
        insight="User prefers TypeScript for new files",
        context="When writing code",
        confidence=0.6,
    )

    q.quick_capture(
        q.EventType.USER_PROMPT,
        session_id="s3",
        data={"payload": {"role": "user", "text": "Can you add a function to this file?"}},
    )

    stats = vl.process_validation_events(limit=10)
    assert stats["validated"] == 0
    assert stats["contradicted"] == 0

    ins = _find_insight(cog, "TypeScript")
    assert ins is not None
    assert ins.times_validated == 0
    assert ins.times_contradicted == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
