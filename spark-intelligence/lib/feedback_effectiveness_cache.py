"""Feedback effectiveness cache: closes the advisory feedback loop.

Reads implicit_feedback.jsonl (tool success/failure after advice) and
advice_feedback.jsonl (explicit helpful/unhelpful) to compute per-source
and per-category effectiveness scores.  These feed back into _rank_score()
so that sources/categories with proven track records get boosted and
persistently-unhelpful ones get penalised.

Design:
- Singleton, lazy-loaded on first call
- Auto-refreshes every REFRESH_INTERVAL_S (checks file mtime, not a timer)
- Exponential decay with HALF_LIFE_DAYS so stale feedback fades
- Returns -1.0 when insufficient data (fewer than MIN_SAMPLES records)
"""

from __future__ import annotations

import json
import math
import os
import time
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from lib.diagnostics import log_debug

# --------------- paths (match the writers) ---------------
IMPLICIT_FEEDBACK_FILE = Path.home() / ".spark" / "advisor" / "implicit_feedback.jsonl"
ADVICE_FEEDBACK_FILE = Path.home() / ".spark" / "advice_feedback.jsonl"

# --------------- tunables ---------------
MAX_RECORDS = 5000          # tail-read cap per file
MIN_SAMPLES = 3             # minimum records before producing a score
HALF_LIFE_DAYS = 14.0       # exponential decay half-life
REFRESH_INTERVAL_S = 300.0  # re-read files every 5 minutes
FOLLOW_WEIGHT = 0.60        # weight of follow_rate in blended score
HELPFUL_WEIGHT = 0.40       # weight of helpful_rate in blended score
CATEGORY_BOOST_FLOOR = 0.90
CATEGORY_BOOST_CEIL = 1.20

_HALF_LIFE_S = HALF_LIFE_DAYS * 86400.0
_LN2 = math.log(2.0)


def _decay_weight(timestamp: float, now: float) -> float:
    """Exponential decay: weight = 2^(-age / half_life)."""
    age = max(0.0, now - timestamp)
    return math.exp(-_LN2 * age / _HALF_LIFE_S) if _HALF_LIFE_S > 0 else 1.0


_KNOWN_SOURCES = frozenset({
    "cognitive", "eidos", "mind", "chip", "bank", "trigger", "replay",
    "opportunity", "convo", "engagement", "semantic", "semantic-hybrid",
    "semantic-agentic", "niche", "self_awareness", "quick",
})


def _normalize_source(raw: str) -> str:
    """Extract clean source type from raw source string or insight key.

    Handles:
      "cognitive"                        -> "cognitive"
      "eidos:eidos:heuristic:df974a3e"   -> "eidos"
      "bank:bank:93e81022d3f3"           -> "bank"
      "adv_xyz_123"                      -> "" (skip)
    """
    s = str(raw).strip().lower()
    if not s or len(s) > 120:
        return ""
    # If it's already a known source type, use directly
    if s in _KNOWN_SOURCES:
        return s
    # Try prefix before first ":"
    if ":" in s:
        prefix = s.split(":", 1)[0].strip()
        if prefix in _KNOWN_SOURCES:
            return prefix
    # Skip advice IDs and trace IDs
    if s.startswith("adv_") or s.startswith("spark-"):
        return ""
    return ""


def _tail_jsonl(path: Path, max_lines: int) -> list:
    """Read the last max_lines from a JSONL file, parsed into dicts."""
    if not path.exists():
        return []
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
        lines = raw.splitlines()[-max_lines:]
        out = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except (json.JSONDecodeError, ValueError):
                continue
        return out
    except Exception as e:
        log_debug("feedback_cache", f"read {path.name} failed", e)
        return []


class _SourceBucket:
    """Accumulator for a single source's weighted follow/helpful rates."""
    __slots__ = ("follow_w", "total_w", "helpful_w", "helpful_total_w")

    def __init__(self) -> None:
        self.follow_w = 0.0      # sum of weights where followed/success
        self.total_w = 0.0       # sum of all weights
        self.helpful_w = 0.0     # sum of weights where helpful=True
        self.helpful_total_w = 0.0  # sum of weights where helpful is known


class FeedbackEffectivenessCache:
    """Singleton cache that aggregates feedback into per-source scores."""

    def __init__(self) -> None:
        self._source_scores: Dict[str, float] = {}
        self._category_scores: Dict[str, float] = {}
        self._source_sample_counts: Dict[str, int] = {}
        self._category_sample_counts: Dict[str, int] = {}
        self._last_refresh: float = 0.0
        self._implicit_mtime: float = 0.0
        self._explicit_mtime: float = 0.0

    def _needs_refresh(self) -> bool:
        now = time.time()
        if now - self._last_refresh < REFRESH_INTERVAL_S:
            return False
        # Check file mtimes
        try:
            im = IMPLICIT_FEEDBACK_FILE.stat().st_mtime if IMPLICIT_FEEDBACK_FILE.exists() else 0.0
        except OSError:
            im = 0.0
        try:
            ex = ADVICE_FEEDBACK_FILE.stat().st_mtime if ADVICE_FEEDBACK_FILE.exists() else 0.0
        except OSError:
            ex = 0.0
        if im == self._implicit_mtime and ex == self._explicit_mtime and self._last_refresh > 0:
            self._last_refresh = now  # no new data, push next check forward
            return False
        self._implicit_mtime = im
        self._explicit_mtime = ex
        return True

    def _refresh(self) -> None:
        """Re-read feedback files and recompute all scores."""
        now = time.time()
        source_buckets: Dict[str, _SourceBucket] = {}
        source_counts: Dict[str, int] = {}
        category_buckets: Dict[str, _SourceBucket] = {}
        category_counts: Dict[str, int] = {}

        def _get_bucket(store: Dict[str, _SourceBucket], key: str) -> _SourceBucket:
            if key not in store:
                store[key] = _SourceBucket()
            return store[key]

        # --- Read implicit feedback (tool success/failure after advice) ---
        for row in _tail_jsonl(IMPLICIT_FEEDBACK_FILE, MAX_RECORDS):
            ts = float(row.get("timestamp", 0) or 0)
            if ts <= 0:
                continue
            w = _decay_weight(ts, now)
            success = bool(row.get("success"))
            sources = row.get("advice_sources") or []
            if isinstance(sources, str):
                sources = [sources]
            for raw_src in sources:
                src = _normalize_source(raw_src)
                if not src:
                    continue
                b = _get_bucket(source_buckets, src)
                b.total_w += w
                if success:
                    b.follow_w += w
                source_counts[src] = source_counts.get(src, 0) + 1

        # --- Read explicit feedback (helpful/unhelpful) ---
        for row in _tail_jsonl(ADVICE_FEEDBACK_FILE, MAX_RECORDS):
            ts = float(row.get("created_at", 0) or 0)
            if ts <= 0:
                continue
            w = _decay_weight(ts, now)
            helpful = row.get("helpful")
            followed = bool(row.get("followed"))
            sources = row.get("sources") or []
            if isinstance(sources, str):
                sources = [sources]
            for raw_src in sources:
                src = _normalize_source(raw_src)
                if not src:
                    continue
                b = _get_bucket(source_buckets, src)
                b.total_w += w
                if followed:
                    b.follow_w += w
                if helpful is True or helpful is False:
                    b.helpful_total_w += w
                    if helpful is True:
                        b.helpful_w += w
                source_counts[src] = source_counts.get(src, 0) + 1

            # Category-level from explicit feedback (uses tool as proxy for category)
            tool = str(row.get("tool") or "").strip().lower()
            if tool:
                cb = _get_bucket(category_buckets, tool)
                cb.total_w += w
                if followed:
                    cb.follow_w += w
                if helpful is True or helpful is False:
                    cb.helpful_total_w += w
                    if helpful is True:
                        cb.helpful_w += w
                category_counts[tool] = category_counts.get(tool, 0) + 1

        # --- Compute source scores ---
        self._source_scores = {}
        self._source_sample_counts = source_counts.copy()
        for src, b in source_buckets.items():
            count = source_counts.get(src, 0)
            if count < MIN_SAMPLES or b.total_w < 0.01:
                self._source_scores[src] = -1.0
                continue
            follow_rate = b.follow_w / b.total_w
            helpful_rate = (b.helpful_w / b.helpful_total_w) if b.helpful_total_w > 0.01 else follow_rate
            blended = FOLLOW_WEIGHT * follow_rate + HELPFUL_WEIGHT * helpful_rate
            self._source_scores[src] = max(0.0, min(1.0, blended))

        # --- Compute category scores (as boost multiplier 0.9-1.2) ---
        self._category_scores = {}
        self._category_sample_counts = category_counts.copy()
        for cat, b in category_buckets.items():
            count = category_counts.get(cat, 0)
            if count < MIN_SAMPLES or b.total_w < 0.01:
                self._category_scores[cat] = 1.0
                continue
            follow_rate = b.follow_w / b.total_w
            helpful_rate = (b.helpful_w / b.helpful_total_w) if b.helpful_total_w > 0.01 else follow_rate
            signal = FOLLOW_WEIGHT * follow_rate + HELPFUL_WEIGHT * helpful_rate
            # Map signal [0,1] to boost [FLOOR, CEIL]
            boost = CATEGORY_BOOST_FLOOR + (CATEGORY_BOOST_CEIL - CATEGORY_BOOST_FLOOR) * signal
            self._category_scores[cat] = max(CATEGORY_BOOST_FLOOR, min(CATEGORY_BOOST_CEIL, boost))

        self._last_refresh = now
        log_debug(
            "feedback_cache",
            f"Refreshed: {len(self._source_scores)} sources, {len(self._category_scores)} categories",
            None,
        )

    def get_source_effectiveness(self, source: str) -> float:
        """Per-source blended effectiveness score.

        Returns:
            0.0-1.0 blended score, or -1.0 if insufficient data.
        """
        if self._needs_refresh():
            self._refresh()
        return self._source_scores.get(str(source).strip().lower(), -1.0)

    def get_category_boost(self, category: str) -> float:
        """Per-category boost multiplier (0.9-1.2).

        Returns 1.0 (neutral) if insufficient data.
        """
        if self._needs_refresh():
            self._refresh()
        return self._category_scores.get(str(category).strip().lower(), 1.0)

    def get_stats(self) -> Dict[str, Any]:
        """Return diagnostic summary of cached scores."""
        if self._needs_refresh():
            self._refresh()
        return {
            "source_scores": dict(self._source_scores),
            "source_sample_counts": dict(self._source_sample_counts),
            "category_boosts": dict(self._category_scores),
            "category_sample_counts": dict(self._category_sample_counts),
            "last_refresh": self._last_refresh,
            "implicit_file_exists": IMPLICIT_FEEDBACK_FILE.exists(),
            "explicit_file_exists": ADVICE_FEEDBACK_FILE.exists(),
        }


# --------------- Singleton ---------------
_cache: Optional[FeedbackEffectivenessCache] = None


def get_feedback_cache() -> FeedbackEffectivenessCache:
    global _cache
    if _cache is None:
        _cache = FeedbackEffectivenessCache()
    return _cache
