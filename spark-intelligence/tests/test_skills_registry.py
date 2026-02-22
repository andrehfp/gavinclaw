from pathlib import Path

import lib.skills_registry as sr


def _write_skill(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def test_skills_registry_loads(tmp_path, monkeypatch):
    monkeypatch.setenv("SPARK_SKILLS_DIR", str(tmp_path))
    monkeypatch.setattr(sr, "INDEX_FILE", tmp_path / "skills_index.json")

    content = """name: auth-specialist
description: Expert in authentication systems
owns:
  - oauth
  - jwt
delegates:
  - skill: token-management
anti_patterns:
  - name: hardcoded secrets
detection:
  - name: find hardcoded secrets
"""
    _write_skill(tmp_path / "security" / "auth-specialist.yaml", content)

    skills = sr.load_skills_index(force_refresh=True)
    assert len(skills) == 1

    s = skills[0]
    assert s["skill_id"] == "auth-specialist"
    assert s["name"] == "auth-specialist"
    assert "oauth" in s["owns"]
    assert "token-management" in s["delegates"]
    assert "hardcoded secrets" in s["anti_patterns"]
