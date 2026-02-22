from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import lib.advisor as advisor_mod
from lib.advisor import Advice


class _DummyCognitive:
    def is_noise_insight(self, _text: str) -> bool:
        return False

    def get_insights_for_context(self, *_args, **_kwargs):
        return []

    def get_self_awareness_insights(self):
        return []


class _FakeMind:
    def get_stats(self):
        return {"last_sync": datetime.now(timezone.utc).isoformat()}


class _FakeRalph:
    def __init__(self, records):
        self.outcome_records = {f"r{i}": rec for i, rec in enumerate(records)}

    def get_insight_effectiveness(self, _insight_key):
        return 0.5


def _record(*, insight_key: str, text: str, outcome: str, tool: str, trace_id: str, latency_s: int = 90):
    now = datetime.now(timezone.utc)
    retrieved = (now - timedelta(seconds=max(1, latency_s))).isoformat()
    return SimpleNamespace(
        learning_id=f"{insight_key}:{trace_id}:{outcome}",
        learning_content=text,
        retrieved_at=retrieved,
        insight_key=insight_key,
        source="cognitive",
        trace_id=trace_id,
        acted_on=True,
        outcome=outcome,
        outcome_evidence=f"tool={tool} success={'True' if outcome == 'good' else 'False'}",
        outcome_at=now.isoformat(),
        outcome_trace_id=trace_id,
        outcome_latency_s=float(latency_s),
    )


def _patch_runtime(monkeypatch, tmp_path: Path, records):
    monkeypatch.setattr(advisor_mod, "ADVISOR_DIR", tmp_path)
    monkeypatch.setattr(advisor_mod, "ADVICE_LOG", tmp_path / "advice_log.jsonl")
    monkeypatch.setattr(advisor_mod, "EFFECTIVENESS_FILE", tmp_path / "effectiveness.json")
    monkeypatch.setattr(advisor_mod, "ADVISOR_METRICS", tmp_path / "metrics.json")
    monkeypatch.setattr(advisor_mod, "RECENT_ADVICE_LOG", tmp_path / "recent_advice.jsonl")
    monkeypatch.setattr(advisor_mod, "RETRIEVAL_ROUTE_LOG", tmp_path / "retrieval_router.jsonl")
    monkeypatch.setattr(advisor_mod, "HAS_EIDOS", False)
    monkeypatch.setattr(advisor_mod, "MIN_RANK_SCORE", 0.0)
    monkeypatch.setattr(advisor_mod, "REPLAY_MIN_STRICT_SAMPLES", 4)
    monkeypatch.setattr(advisor_mod, "REPLAY_MIN_IMPROVEMENT_DELTA", 0.20)
    monkeypatch.setattr(advisor_mod, "REPLAY_ADVISORY_ENABLED", True)
    monkeypatch.setattr(advisor_mod, "get_cognitive_learner", lambda: _DummyCognitive())
    monkeypatch.setattr(advisor_mod, "get_mind_bridge", lambda: _FakeMind())
    monkeypatch.setattr("lib.meta_ralph.get_meta_ralph", lambda: _FakeRalph(records))

    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_bank_advice", lambda _s, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_chip_advice", lambda _s, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_mind_advice", lambda _s, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_tool_specific_advice", lambda _s, _t: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_opportunity_advice", lambda _s, **_k: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_surprise_advice", lambda _s, _t, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_skill_advice", lambda _s, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_convo_advice", lambda _s, _t, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_engagement_advice", lambda _s, _t, _c: [])
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_niche_advice", lambda _s, _t, _c: [])


def test_replay_advisory_surfaces_better_alternative(monkeypatch, tmp_path):
    records = []
    records.extend(
        [
            _record(
                insight_key="k_bad",
                text="Retry directly without jitter.",
                outcome=("good" if i == 0 else "bad"),
                tool="Edit",
                trace_id=f"bad-{i}",
            )
            for i in range(4)
        ]
    )
    records.extend(
        [
            _record(
                insight_key="k_good",
                text="Use capped jittered retries after verification.",
                outcome=("bad" if i == 0 else "good"),
                tool="Edit",
                trace_id=f"good-{i}",
            )
            for i in range(5)
        ]
    )
    _patch_runtime(monkeypatch, tmp_path, records)

    baseline = Advice(
        advice_id="baseline",
        insight_key="k_bad",
        text="Retry directly without jitter.",
        confidence=0.8,
        source="cognitive",
        context_match=0.9,
    )
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_cognitive_advice", lambda _s, _t, _c, _sc=None: [baseline])

    advisor = advisor_mod.SparkAdvisor()
    out = advisor.advise(
        "Edit",
        {"file_path": "lib/advisor.py"},
        "fix retry behavior after flaky failures",
        include_mind=False,
        track_retrieval=False,
        log_recent=False,
    )

    replay = [row for row in out if row.source == "replay"]
    assert replay
    assert "[Replay]" in replay[0].text
    assert "Try the alternative?" in replay[0].text
    assert "80%" in replay[0].text
    assert "25%" in replay[0].text


def test_replay_advisory_requires_meaningful_delta(monkeypatch, tmp_path):
    records = []
    records.extend(
        [
            _record(
                insight_key="k_a",
                text="Pattern A",
                outcome=("good" if i < 2 else "bad"),
                tool="Edit",
                trace_id=f"a-{i}",
            )
            for i in range(4)
        ]
    )
    records.extend(
        [
            _record(
                insight_key="k_b",
                text="Pattern B",
                outcome=("good" if i < 3 else "bad"),
                tool="Edit",
                trace_id=f"b-{i}",
            )
            for i in range(5)
        ]
    )
    _patch_runtime(monkeypatch, tmp_path, records)
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_cognitive_advice", lambda _s, _t, _c, _sc=None: [])

    advisor = advisor_mod.SparkAdvisor()
    out = advisor.advise(
        "Edit",
        {"file_path": "lib/advisor.py"},
        "improve retry logic",
        include_mind=False,
        track_retrieval=False,
        log_recent=False,
    )

    assert all(row.source != "replay" for row in out)


def test_replay_advisory_ignores_non_strict_outcomes(monkeypatch, tmp_path):
    good = _record(
        insight_key="k_good",
        text="Use guarded fallback flow",
        outcome="good",
        tool="Read",
        trace_id="x-good",
    )
    bad = _record(
        insight_key="k_bad",
        text="Skip validation step",
        outcome="bad",
        tool="Read",
        trace_id="x-bad",
    )
    # Make one side non-strict by mismatching trace IDs.
    bad.outcome_trace_id = "trace-mismatch"

    records = [good, good, good, good, bad, bad, bad, bad]
    _patch_runtime(monkeypatch, tmp_path, records)
    monkeypatch.setattr(advisor_mod.SparkAdvisor, "_get_cognitive_advice", lambda _s, _t, _c, _sc=None: [])

    advisor = advisor_mod.SparkAdvisor()
    out = advisor.advise(
        "Read",
        {"file_path": "README.md"},
        "review and verify docs flow",
        include_mind=False,
        track_retrieval=False,
        log_recent=False,
    )

    assert all(row.source != "replay" for row in out)
