from scripts.openclaw_realtime_e2e_benchmark import _advisory_emit_health


def test_advisory_emit_health_passes_with_emitted_events():
    result = _advisory_emit_health(
        engine_metrics={"event_counts": {"emitted": 2, "global_dedupe_suppressed": 0}},
        workspace_metrics={
            "workspaces": [{"advisory_exists": True, "advisory_age_s": 3600}],
            "fallback_advisory_exists": True,
            "fallback_advisory_age_s": 3600,
        },
        window_s=1800,
    )
    assert result["ok"] is True
    assert result["mode"] == "emitted"


def test_advisory_emit_health_passes_with_dedupe_and_recent_delivery():
    result = _advisory_emit_health(
        engine_metrics={"event_counts": {"emitted": 0, "global_dedupe_suppressed": 3}},
        workspace_metrics={
            "workspaces": [{"advisory_exists": True, "advisory_age_s": 120}],
            "fallback_advisory_exists": False,
            "fallback_advisory_age_s": None,
        },
        window_s=1800,
    )
    assert result["ok"] is True
    assert result["mode"] == "dedupe_suppressed_recent_delivery"


def test_advisory_emit_health_fails_without_effective_delivery_signal():
    result = _advisory_emit_health(
        engine_metrics={"event_counts": {"emitted": 0, "global_dedupe_suppressed": 2}},
        workspace_metrics={
            "workspaces": [{"advisory_exists": True, "advisory_age_s": 7200}],
            "fallback_advisory_exists": False,
            "fallback_advisory_age_s": None,
        },
        window_s=1800,
    )
    assert result["ok"] is False
    assert result["mode"] == "no_effective_delivery_signal"
