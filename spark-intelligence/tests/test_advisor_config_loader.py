from __future__ import annotations

import json

import lib.advisor as advisor_mod


def test_load_advisor_config_supports_utf8_bom(monkeypatch, tmp_path):
    spark_dir = tmp_path / ".spark"
    spark_dir.mkdir(parents=True, exist_ok=True)
    tuneables = spark_dir / "tuneables.json"
    tuneables.write_text(
        json.dumps(
            {
                "advisor": {
                    "max_items": 4,
                    "max_advice_items": 4,
                    "min_rank_score": 0.55,
                    "cache_ttl": 120,
                }
            }
        ),
        encoding="utf-8-sig",
    )

    monkeypatch.setattr(advisor_mod.Path, "home", lambda: tmp_path)
    monkeypatch.setattr(advisor_mod, "MAX_ADVICE_ITEMS", 8)
    monkeypatch.setattr(advisor_mod, "MIN_RANK_SCORE", 0.35)
    monkeypatch.setattr(advisor_mod, "ADVICE_CACHE_TTL_SECONDS", 180)

    advisor_mod._load_advisor_config()

    assert advisor_mod.MAX_ADVICE_ITEMS == 4
    assert advisor_mod.MIN_RANK_SCORE == 0.55
    assert advisor_mod.ADVICE_CACHE_TTL_SECONDS == 120
