"""Lightweight skills indexer for H70-C+ YAML skills.

This intentionally avoids full YAML parsing to keep dependencies minimal.
It extracts only top-level fields and a few nested list items.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


SKILLS_DIR_ENV = "SPARK_SKILLS_DIR"
INDEX_FILE = Path.home() / ".spark" / "skills_index.json"


@dataclass
class SkillRecord:
    skill_id: str
    name: str
    description: str
    owns: List[str]
    delegates: List[str]
    anti_patterns: List[str]
    detection: List[str]
    category: str
    path: str
    mtime: float

    def to_dict(self) -> Dict:
        return asdict(self)


def _strip_quotes(s: str) -> str:
    s = (s or "").strip()
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        return s[1:-1].strip()
    return s


def _parse_skill(text: str) -> Dict[str, List[str] | str]:
    """Extract minimal fields from a YAML skill file using simple heuristics."""
    out: Dict[str, List[str] | str] = {
        "name": "",
        "description": "",
        "owns": [],
        "delegates": [],
        "anti_patterns": [],
        "detection": [],
    }

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue

        # Top-level keys have no leading spaces.
        if line and not line.startswith((" ", "\t")):
            m = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
            if not m:
                i += 1
                continue
            key = m.group(1).strip()
            rest = m.group(2).strip()

            if key in ("name", "description"):
                if rest and rest not in ("|", ">", "|+", "|-", ">+", ">-"):
                    out[key] = _strip_quotes(rest)
                    i += 1
                    continue
                # Block scalar: collect indented lines that follow
                block_lines: List[str] = []
                i += 1
                while i < len(lines):
                    bl = lines[i]
                    if bl and not bl.startswith((" ", "\t")):
                        break
                    stripped = bl.strip()
                    if stripped:
                        block_lines.append(stripped)
                    elif block_lines:
                        break  # blank line after content ends the block
                    i += 1
                if block_lines:
                    out[key] = _strip_quotes(" ".join(block_lines))
                continue

            if key in ("owns", "delegates", "anti_patterns", "detection"):
                items: List[str] = []
                i += 1
                while i < len(lines):
                    l = lines[i]
                    if l and not l.startswith((" ", "\t")):
                        break
                    s = l.strip()
                    if not s:
                        i += 1
                        continue

                    if key == "owns":
                        if s.startswith("- "):
                            items.append(_strip_quotes(s[2:].strip()))
                    elif key == "delegates":
                        if s.startswith("- "):
                            val = s[2:].strip()
                            if val.startswith("skill:"):
                                items.append(_strip_quotes(val.split(":", 1)[1]))
                        elif s.startswith("skill:"):
                            items.append(_strip_quotes(s.split(":", 1)[1]))
                    elif key in ("anti_patterns", "detection"):
                        if s.startswith("- name:"):
                            items.append(_strip_quotes(s.split(":", 1)[1]))
                        elif s.startswith("name:"):
                            items.append(_strip_quotes(s.split(":", 1)[1]))

                    i += 1

                out[key] = items
                continue

        i += 1

    return out


def _skills_dir() -> Optional[Path]:
    raw = os.environ.get(SKILLS_DIR_ENV)
    if not raw:
        return None
    p = Path(raw).expanduser()
    return p if p.exists() else None


def _list_skill_files(root: Path) -> List[Path]:
    return [
        p for p in root.rglob("*")
        if p.is_file() and p.suffix.lower() in (".yaml", ".yml")
    ]


def _load_cache() -> Optional[Dict]:
    if not INDEX_FILE.exists():
        return None
    try:
        return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_cache(payload: Dict) -> None:
    INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    INDEX_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_skills_index(force_refresh: bool = False) -> List[Dict]:
    """Return list of indexed skills (dicts)."""
    root = _skills_dir()
    if not root:
        return []

    files = _list_skill_files(root)
    current = {str(p.relative_to(root)): p.stat().st_mtime for p in files}

    if not force_refresh:
        cache = _load_cache()
        if cache and cache.get("source_dir") == str(root):
            cached_files = cache.get("files", {})
            if cached_files == current:
                return cache.get("skills", [])

    skills: List[SkillRecord] = []
    for p in files:
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        parsed = _parse_skill(text)
        name = str(parsed.get("name") or "").strip()
        description = str(parsed.get("description") or "").strip()
        skill_id = name or p.stem
        rel = p.relative_to(root)
        category = rel.parts[0] if len(rel.parts) > 1 else "root"

        skills.append(SkillRecord(
            skill_id=skill_id,
            name=name or skill_id,
            description=description,
            owns=list(parsed.get("owns") or []),
            delegates=list(parsed.get("delegates") or []),
            anti_patterns=list(parsed.get("anti_patterns") or []),
            detection=list(parsed.get("detection") or []),
            category=category,
            path=str(rel),
            mtime=p.stat().st_mtime,
        ))

    payload = {
        "source_dir": str(root),
        "generated_at": datetime.now().isoformat(),
        "files": current,
        "skills": [s.to_dict() for s in skills],
    }
    _save_cache(payload)
    return payload["skills"]
