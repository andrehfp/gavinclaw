import lib.advisory_synthesizer as synth
import lib.consciousness_bridge as bridge


def test_bridge_override_takes_precedence_over_local_emotions(monkeypatch):
    monkeypatch.setattr(
        synth,
        "_resolve_local_emotion_hooks",
        lambda: {
            "current_emotion": "supportive_focus",
            "strategy": {
                "response_pace": "measured",
                "verbosity": "structured",
                "tone_shape": "calm_focus",
                "ask_clarifying_question": False,
            },
            "guardrails": {
                "user_guided": True,
                "no_autonomous_objectives": True,
                "no_manipulative_affect": True,
            },
            "source": "spark_emotions",
        },
    )
    monkeypatch.setattr(
        synth,
        "_resolve_bridge_strategy",
        lambda: {
            "strategy": {
                "response_pace": "lively",
                "verbosity": "concise",
                "tone_shape": "encouraging",
                "ask_clarifying_question": True,
            },
            "source": "consciousness_bridge_v1",
            "max_influence": 0.35,
        },
    )

    hooks = synth._emotion_decision_hooks()

    assert hooks["strategy"]["response_pace"] == "lively"
    assert hooks["strategy"]["verbosity"] == "concise"
    assert hooks["strategy"]["tone_shape"] == "encouraging"
    assert hooks["strategy"]["ask_clarifying_question"] is True
    assert hooks["strategy_source"] == "consciousness_bridge_v1"
    assert hooks["source_chain"] == ["spark_emotions", "consciousness_bridge_v1"]
    assert hooks["bridge"]["applied"] is True


def test_bridge_fallback_keeps_local_emotion_strategy(monkeypatch):
    monkeypatch.setattr(
        synth,
        "_resolve_local_emotion_hooks",
        lambda: {
            "current_emotion": "steady",
            "strategy": {
                "response_pace": "measured",
                "verbosity": "structured",
                "tone_shape": "calm_focus",
                "ask_clarifying_question": False,
            },
            "guardrails": {
                "user_guided": True,
                "no_autonomous_objectives": True,
                "no_manipulative_affect": True,
            },
            "source": "spark_emotions",
        },
    )
    monkeypatch.setattr(synth, "_resolve_bridge_strategy", lambda: {})

    hooks = synth._emotion_decision_hooks()

    assert hooks["strategy"]["response_pace"] == "measured"
    assert hooks["strategy"]["verbosity"] == "structured"
    assert hooks["strategy_source"] == "spark_emotions"
    assert hooks["source_chain"] == ["spark_emotions"]
    assert hooks["bridge"]["applied"] is False


def test_resolve_bridge_strategy_ignores_non_bridge_source(monkeypatch):
    monkeypatch.setattr(
        bridge,
        "resolve_strategy",
        lambda: {
            "strategy": {"response_pace": "lively"},
            "source": "fallback",
            "max_influence": 0.1,
        },
    )

    result = synth._resolve_bridge_strategy()

    assert result == {}


def test_resolve_bridge_strategy_clamps_influence(monkeypatch):
    monkeypatch.setattr(
        bridge,
        "resolve_strategy",
        lambda: {
            "strategy": {
                "response_pace": "lively",
                "verbosity": "concise",
                "tone_shape": "encouraging",
                "ask_clarifying_question": True,
            },
            "source": "consciousness_bridge_v1",
            "max_influence": 2.0,
        },
    )

    result = synth._resolve_bridge_strategy()

    assert result["source"] == "consciousness_bridge_v1"
    assert result["max_influence"] == 0.35
    assert result["strategy"]["response_pace"] == "lively"
