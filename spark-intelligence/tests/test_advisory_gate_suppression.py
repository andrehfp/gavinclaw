import lib.advisory_gate as gate


def test_suppresses_telemetry_style_struggle_cautions():
    suppressed, reason = gate._check_obvious_suppression(
        "[Caution] I struggle with tool_49_error tasks",
        "Edit",
        {},
        None,
    )

    assert suppressed is True
    assert reason == "telemetry struggle caution"


def test_keeps_non_telemetry_tool_failure_cautions():
    suppressed, reason = gate._check_obvious_suppression(
        "[Caution] I fail when WebFetch retries are too aggressive.",
        "WebFetch",
        {},
        None,
    )

    assert suppressed is False
    assert reason == ""
