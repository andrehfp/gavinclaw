"""Lightweight skill router based on lexical scoring."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Dict, List, Optional

from .skills_registry import load_skills_index


EFFECTIVENESS_FILE = Path.home() / ".spark" / "skills_effectiveness.json"


def _tokenize(text: str) -> List[str]:
    return [t for t in re.split(r"\W+", (text or "").lower()) if len(t) > 2]


def _load_effectiveness() -> Dict[str, Dict[str, int]]:
    if not EFFECTIVENESS_FILE.exists():
        return {}
    try:
        return json.loads(EFFECTIVENESS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _effectiveness_multiplier(skill_id: str, effectiveness: Dict[str, Dict[str, int]]) -> float:
    stats = effectiveness.get(skill_id)
    if not stats:
        return 1.0
    success = int(stats.get("success", 0))
    fail = int(stats.get("fail", 0))
    # Laplace smoothing
    rate = (success + 1) / (success + fail + 2)
    return 0.7 + (0.6 * rate)  # 0.7x to 1.3x


def _score_skill(skill: Dict, query: str, tokens: List[str]) -> float:
    name = (skill.get("name") or "").lower()
    desc = (skill.get("description") or "").lower()
    owns = " ".join(skill.get("owns") or []).lower()
    delegates = " ".join(skill.get("delegates") or []).lower()
    anti = " ".join(skill.get("anti_patterns") or []).lower()
    detection = " ".join(skill.get("detection") or []).lower()

    score = 0.0

    if query and query in name:
        score += 3.0
    if query and query in desc:
        score += 2.0

    for t in tokens:
        if t in name:
            score += 1.8
        if t in desc:
            score += 1.2
        if t in owns:
            score += 1.4
        if t in delegates:
            score += 0.9
        if t in anti:
            score += 0.5
        if t in detection:
            score += 0.4

    return score


def recommend_skills(
    query: str,
    limit: int = 3,
    skills: Optional[List[Dict]] = None,
    effectiveness: Optional[Dict[str, Dict[str, int]]] = None
) -> List[Dict]:
    """Return top skills for a query with a lightweight score."""
    q = (query or "").strip().lower()
    if not q:
        return []

    skills = skills if skills is not None else load_skills_index()
    if not skills:
        return []

    tokens = _tokenize(q)
    effectiveness = effectiveness if effectiveness is not None else _load_effectiveness()

    scored: List[Dict] = []
    for s in skills:
        base = _score_skill(s, q, tokens)
        if base <= 0:
            continue
        mult = _effectiveness_multiplier(s.get("skill_id") or s.get("name"), effectiveness)
        score = base * mult
        if score <= 0:
            continue
        item = dict(s)
        item["score"] = round(float(score), 4)
        scored.append(item)

    scored.sort(key=lambda x: x.get("score", 0), reverse=True)
    return scored[: max(1, min(limit, 10))]
