from __future__ import annotations

import lib.advisory_synthesizer as synth


def test_load_repo_env_value_prefers_process_env(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text("MINIMAX_API_KEY=from_file\n", encoding="utf-8")

    monkeypatch.setattr(synth, "_REPO_ENV_FILE", env_file)
    monkeypatch.setenv("MINIMAX_API_KEY", "from_env")

    assert synth._load_repo_env_value("MINIMAX_API_KEY", "SPARK_MINIMAX_API_KEY") == "from_env"


def test_load_repo_env_value_falls_back_to_repo_env(monkeypatch, tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# comment\nSPARK_MINIMAX_API_KEY=from_repo_env\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(synth, "_REPO_ENV_FILE", env_file)
    monkeypatch.delenv("MINIMAX_API_KEY", raising=False)
    monkeypatch.delenv("SPARK_MINIMAX_API_KEY", raising=False)

    assert synth._load_repo_env_value("MINIMAX_API_KEY", "SPARK_MINIMAX_API_KEY") == "from_repo_env"
