import json

from lib.cognitive_learner import CognitiveCategory, CognitiveLearner
import lib.cognitive_learner as cognitive_mod


def test_add_insight_captures_emotion_state(monkeypatch, tmp_path):
    monkeypatch.setattr(CognitiveLearner, "INSIGHTS_FILE", tmp_path / "cognitive_insights.json")
    monkeypatch.setattr(CognitiveLearner, "LOCK_FILE", tmp_path / ".cognitive.lock")
    monkeypatch.setattr(
        cognitive_mod,
        "_capture_emotion_state_snapshot",
        lambda: {
            "primary_emotion": "careful",
            "mode": "real_talk",
            "strain": 0.31,
            "captured_at": 1700000000.0,
        },
    )

    learner = CognitiveLearner()
    insight = learner.add_insight(
        category=CognitiveCategory.REASONING,
        insight="Verify contracts before changing payload shapes",
        context="schema checks prevent regressions",
        record_exposure=False,
        source="openclaw",
    )

    assert insight is not None
    assert insight.emotion_state.get("primary_emotion") == "careful"

    raw = json.loads((tmp_path / "cognitive_insights.json").read_text(encoding="utf-8"))
    row = next(iter(raw.values()))
    assert row["emotion_state"]["primary_emotion"] == "careful"
