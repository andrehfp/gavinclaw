from lib.events import SparkEventKind, SparkEventV1
from lib.queue import EventType
import sparkd


def _evt(kind: SparkEventKind, payload: dict, *, source: str = "openclaw") -> SparkEventV1:
    return SparkEventV1(
        v=1,
        source=source,
        kind=kind,
        ts=1700000000.0,
        session_id="sess-openclaw",
        payload=payload,
        trace_id="trace-openclaw",
    )


def test_resolve_queue_event_type_maps_tool_pre_and_post():
    message = _evt(SparkEventKind.MESSAGE, {"role": "user", "text": "hello"})
    tool_call = _evt(SparkEventKind.TOOL, {"tool_name": "Edit", "tool_input": {"file_path": "a.py"}})
    tool_ok = _evt(SparkEventKind.TOOL, {"tool_name": "Edit", "tool_result": "done", "is_error": False})
    tool_fail = _evt(SparkEventKind.TOOL, {"tool_name": "Edit", "tool_result": "boom", "is_error": True})
    command = _evt(SparkEventKind.COMMAND, {"command": "session_start"})

    assert sparkd._resolve_queue_event_type(message) == EventType.USER_PROMPT
    assert sparkd._resolve_queue_event_type(tool_call) == EventType.PRE_TOOL
    assert sparkd._resolve_queue_event_type(tool_ok) == EventType.POST_TOOL
    assert sparkd._resolve_queue_event_type(tool_fail) == EventType.POST_TOOL_FAILURE
    assert sparkd._resolve_queue_event_type(command) == EventType.SESSION_START


def test_openclaw_runtime_bridge_calls_user_prompt_and_emotion(monkeypatch):
    calls = []

    monkeypatch.setattr(
        sparkd,
        "_load_openclaw_runtime_config",
        lambda force=False: {
            "advisory_bridge_enabled": True,
            "emotion_updates_enabled": True,
            "emotion_trigger_intensity": 0.66,
        },
    )
    monkeypatch.setattr(
        sparkd,
        "_call_advisory_on_user_prompt",
        lambda session_id, prompt_text, trace_id=None: calls.append(
            ("user_prompt", session_id, prompt_text, trace_id)
        ),
    )
    monkeypatch.setattr(
        sparkd,
        "_emotion_register_trigger",
        lambda trigger, intensity=0.7, note="": calls.append(
            ("emotion_trigger", trigger, round(float(intensity), 2), note)
        ),
    )
    monkeypatch.setattr(sparkd, "_emotion_recover", lambda: calls.append(("emotion_recover",)))

    evt = _evt(
        SparkEventKind.MESSAGE,
        {"role": "user", "text": "I am confused and this is not clear"},
    )
    sparkd._maybe_bridge_openclaw_runtime(evt, EventType.USER_PROMPT)

    assert ("user_prompt", "sess-openclaw", "I am confused and this is not clear", "trace-openclaw") in calls
    assert ("emotion_trigger", "user_confusion", 0.66, "openclaw_user_prompt") in calls
    assert ("emotion_recover",) not in calls


def test_openclaw_runtime_bridge_calls_pre_and_post_tool(monkeypatch):
    calls = []

    monkeypatch.setattr(
        sparkd,
        "_load_openclaw_runtime_config",
        lambda force=False: {
            "advisory_bridge_enabled": True,
            "emotion_updates_enabled": True,
            "emotion_trigger_intensity": 0.7,
        },
    )
    monkeypatch.setattr(
        sparkd,
        "_call_advisory_on_pre_tool",
        lambda session_id, tool_name, tool_input=None, trace_id=None: calls.append(
            ("pre_tool", session_id, tool_name, trace_id, tool_input or {})
        ),
    )
    monkeypatch.setattr(
        sparkd,
        "_call_advisory_on_post_tool",
        lambda session_id, tool_name, success, tool_input=None, trace_id=None, error=None: calls.append(
            ("post_tool", session_id, tool_name, bool(success), trace_id, error)
        ),
    )
    monkeypatch.setattr(
        sparkd,
        "_emotion_register_trigger",
        lambda trigger, intensity=0.7, note="": calls.append(("emotion_trigger", trigger, note)),
    )
    monkeypatch.setattr(sparkd, "_emotion_recover", lambda: calls.append(("emotion_recover",)))

    pre_evt = _evt(
        SparkEventKind.TOOL,
        {"tool_name": "Edit", "tool_input": {"file_path": "lib/a.py"}},
    )
    fail_evt = _evt(
        SparkEventKind.TOOL,
        {"tool_name": "Edit", "tool_input": {"file_path": "lib/a.py"}, "tool_result": "permission denied", "is_error": True},
    )

    sparkd._maybe_bridge_openclaw_runtime(pre_evt, EventType.PRE_TOOL)
    sparkd._maybe_bridge_openclaw_runtime(fail_evt, EventType.POST_TOOL_FAILURE)

    assert ("pre_tool", "sess-openclaw", "Edit", "trace-openclaw", {"file_path": "lib/a.py"}) in calls
    assert ("post_tool", "sess-openclaw", "Edit", False, "trace-openclaw", "permission denied") in calls
    assert ("emotion_trigger", "repair_after_mistake", "openclaw_tool_failure:Edit") in calls


def test_dispatch_bridge_can_run_inline_when_async_disabled(monkeypatch):
    calls = []
    monkeypatch.setattr(
        sparkd,
        "_load_openclaw_runtime_config",
        lambda force=False: {
            "advisory_bridge_enabled": True,
            "emotion_updates_enabled": False,
            "emotion_trigger_intensity": 0.7,
            "async_dispatch_enabled": False,
        },
    )
    monkeypatch.setattr(
        sparkd,
        "_maybe_bridge_openclaw_runtime",
        lambda evt, event_type: calls.append((evt.session_id, event_type.value)),
    )
    evt = _evt(SparkEventKind.MESSAGE, {"role": "user", "text": "hello"})
    sparkd._dispatch_openclaw_runtime_bridge(evt, EventType.USER_PROMPT)
    assert calls == [("sess-openclaw", "user_prompt")]
