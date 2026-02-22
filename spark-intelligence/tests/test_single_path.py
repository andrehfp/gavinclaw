"""Test that pattern detection and outcome reporting each have a single path.

After the cleanup:
- Pattern detection: pipeline only (not hook)
- Outcome reporting: hook only (not bridge_cycle)
"""

import inspect
from pathlib import Path

HOOK_PATH = Path(__file__).parent.parent / "hooks" / "observe.py"


def test_hook_does_not_call_aggregator():
    """observe.py must NOT call aggregator.process_event() (removed in Change 4)."""
    source = HOOK_PATH.read_text(encoding="utf-8")
    # The import should be gone
    assert "from lib.pattern_detection import get_aggregator" not in source, (
        "Hook still imports get_aggregator -- should be removed"
    )
    # The call should be gone
    assert "aggregator.process_event" not in source, (
        "Hook still calls aggregator.process_event() -- should be removed"
    )


def test_pipeline_calls_aggregator():
    """Pipeline must still call aggregator.process_event()."""
    from lib.pipeline import run_processing_cycle
    source = inspect.getsource(run_processing_cycle)
    assert "aggregator.process_event" in source, (
        "Pipeline must call aggregator.process_event()"
    )


def test_bridge_cycle_does_not_report_outcomes():
    """bridge_cycle.run_bridge_cycle must NOT call report_outcome (removed in Change 3)."""
    from lib.bridge_cycle import run_bridge_cycle
    source = inspect.getsource(run_bridge_cycle)
    assert "report_outcome" not in source, (
        "bridge_cycle still calls report_outcome -- should be removed"
    )


def test_hook_still_reports_outcomes():
    """The hook should still report outcomes (with recovery detection)."""
    source = HOOK_PATH.read_text(encoding="utf-8")
    assert "report_outcome" in source, (
        "observe.py should still report outcomes"
    )


def test_pipeline_maps_type_for_eidos():
    """Pipeline should map hook_event to aggregator 'type' key for EIDOS."""
    from lib.pipeline import run_processing_cycle
    source = inspect.getsource(run_processing_cycle)
    assert '"user_message"' in source, (
        "Pipeline should map UserPromptSubmit to 'user_message' type"
    )
    assert '"action_complete"' in source, (
        "Pipeline should map PostToolUse to 'action_complete' type"
    )
    assert '"failure"' in source, (
        "Pipeline should map PostToolUseFailure to 'failure' type"
    )
