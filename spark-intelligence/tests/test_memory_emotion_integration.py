from __future__ import annotations

from pathlib import Path

import lib.memory_banks as memory_banks
import lib.memory_store as memory_store


def _configure_temp_memory_paths(tmp_path: Path, monkeypatch) -> None:
    banks_dir = tmp_path / "banks"
    monkeypatch.setattr(memory_banks, "BANK_DIR", banks_dir)
    monkeypatch.setattr(memory_banks, "GLOBAL_FILE", banks_dir / "global_user.jsonl")
    monkeypatch.setattr(memory_banks, "PROJECTS_DIR", banks_dir / "projects")

    monkeypatch.setattr(memory_store, "DB_PATH", tmp_path / "memory_store.sqlite")
    monkeypatch.setattr(memory_store, "_FTS_AVAILABLE", None)
    monkeypatch.setattr(memory_store, "_embed_texts", lambda _texts: None)


def test_store_memory_writes_emotion_snapshot_into_meta(tmp_path, monkeypatch):
    _configure_temp_memory_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(memory_banks, "infer_project_key", lambda max_events=60: None)
    monkeypatch.setattr(memory_banks, "_emotion_write_capture_enabled", lambda: True)
    monkeypatch.setattr(
        memory_banks,
        "_current_emotion_snapshot",
        lambda: {
            "primary_emotion": "careful",
            "mode": "real_talk",
            "strain": 0.82,
            "calm": 0.61,
            "energy": 0.58,
            "confidence": 0.74,
            "warmth": 0.66,
            "playfulness": 0.25,
            "captured_at": 123.0,
        },
    )

    entry = memory_banks.store_memory(
        text="Rollback deploy in small steps and keep a clean fallback.",
        category="context",
        source="capture",
    )
    assert entry is not None
    assert entry.meta["emotion"]["primary_emotion"] == "careful"

    results = memory_store.retrieve("rollback deploy fallback", limit=3, candidate_limit=20)
    assert results
    assert results[0]["meta"]["emotion"]["primary_emotion"] == "careful"


def test_memory_store_retrieval_boosts_emotion_state_match(tmp_path, monkeypatch):
    _configure_temp_memory_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(
        memory_store,
        "_load_memory_emotion_config",
        lambda force=False: {
            "enabled": True,
            "retrieval_state_match_weight": 0.9,
            "retrieval_min_state_similarity": 0.0,
        },
    )
    monkeypatch.setattr(
        memory_store,
        "_current_retrieval_emotion_state",
        lambda: {
            "primary_emotion": "careful",
            "mode": "real_talk",
            "strain": 0.84,
            "calm": 0.58,
            "energy": 0.60,
            "confidence": 0.72,
            "warmth": 0.66,
            "playfulness": 0.22,
        },
    )

    shared_text = "Rollback deploy checklist with validation and fallback."
    memory_store.upsert_entry(
        memory_id="m-calm",
        content=shared_text,
        scope="global",
        project_key=None,
        category="context",
        created_at=100.0,
        source="test",
        meta={"emotion": {"primary_emotion": "steady", "mode": "real_talk", "strain": 0.2, "calm": 0.85}},
    )
    memory_store.upsert_entry(
        memory_id="m-careful",
        content=shared_text,
        scope="global",
        project_key=None,
        category="context",
        created_at=101.0,
        source="test",
        meta={"emotion": {"primary_emotion": "careful", "mode": "real_talk", "strain": 0.86, "calm": 0.55}},
    )

    results = memory_store.retrieve("rollback deploy checklist fallback", limit=2, candidate_limit=20)
    assert len(results) == 2
    assert results[0]["entry_id"] == "m-careful"
    assert float(results[0].get("emotion_state_match") or 0.0) > float(results[1].get("emotion_state_match") or 0.0)
    assert float(results[0].get("emotion_score_boost") or 0.0) > 0.0
