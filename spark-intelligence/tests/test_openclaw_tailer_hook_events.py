import json

from adapters import openclaw_tailer as tailer


def _write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")


def test_parse_hook_event_row_maps_llm_input():
    evt = tailer._parse_hook_event_row(
        {
            "hook": "llm_input",
            "ts": 1700.0,
            "run_id": "run-1",
            "session_id": "session-1",
            "provider": "openai",
            "model": "gpt-5",
            "prompt": "hello world",
            "system_prompt": "sys",
            "history_messages": [
                {"role": "tool"},
                {"role": "assistant", "content": [{"type": "toolCall", "name": "Read"}]},
            ],
            "images_count": 1,
        }
    )

    assert evt is not None
    assert evt["kind"] == "system"
    assert evt["session_id"] == "session-1"
    payload = evt["payload"]
    assert payload["type"] == "openclaw_hook"
    assert payload["hook"] == "llm_input"
    assert payload["prompt_chars"] == 11
    assert payload["history_count"] == 2
    assert payload["history_tool_message_count"] == 1
    assert payload["history_tool_block_count"] == 1


def test_scan_hook_events_posts_and_advances_offset(tmp_path, monkeypatch):
    spool = tmp_path / "openclaw_hook_events.jsonl"
    _write_jsonl(
        spool,
        [
            {
                "hook": "llm_input",
                "ts": 1000.0,
                "run_id": "r-1",
                "session_id": "s-1",
                "provider": "openai",
                "model": "gpt-5",
                "prompt": "abc",
                "history_messages": [],
            },
            {
                "hook": "llm_output",
                "ts": 1001.0,
                "run_id": "r-1",
                "session_id": "s-1",
                "provider": "openai",
                "model": "gpt-5",
                "assistant_texts": ["ok"],
                "usage": {"input": 1, "output": 1, "total": 2},
            },
            {
                "hook": "something_else",
                "ts": 1002.0,
            },
        ],
    )

    posted = []

    def _fake_post(url, payload, token=None):
        posted.append((url, payload, token))

    monkeypatch.setattr(tailer, "_post_json", _fake_post)
    state = tailer.SessionState(tmp_path / "state.json")

    # First pass registers hook spool in state.
    assert (
        tailer._scan_hook_events(
            spool,
            state,
            "http://127.0.0.1:8787",
            max_per_tick=50,
            backfill=True,
        )
        == 0
    )
    # Second pass ingests all rows, including non-hook rows as consumed offsets.
    assert (
        tailer._scan_hook_events(
            spool,
            state,
            "http://127.0.0.1:8787",
            max_per_tick=50,
            backfill=True,
        )
        == 3
    )
    assert len(posted) == 2
    assert posted[0][1]["payload"]["hook"] == "llm_input"
    assert posted[1][1]["payload"]["hook"] == "llm_output"
    assert state.get_offset(f"hook::{spool}") == 3
