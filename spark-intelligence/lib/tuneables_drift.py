"""
Tuneables drift distance calculator.

Computes normalized distance between runtime tuneables (~/.spark/tuneables.json)
and the version-controlled baseline (config/tuneables.json). Logs drift history
to ~/.spark/tuneable_drift.jsonl and alerts when threshold exceeded.

Distance metric per key:
  - float/int:  abs(a - b) / max(abs(a), abs(b), 1e-9)
  - bool/str:   0.0 if same, 1.0 if different
  - dict/list:  0.0 if equal, 1.0 if not

Aggregate: mean of per-key deltas within each section, then mean across sections.

Usage:
    from lib.tuneables_drift import check_drift
    result = check_drift()
    print(f"drift={result.drift_score:.4f}, alert={result.alert}")
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

BASELINE_FILE = Path(__file__).resolve().parent.parent / "config" / "tuneables.json"
RUNTIME_FILE = Path.home() / ".spark" / "tuneables.json"
DRIFT_LOG_FILE = Path.home() / ".spark" / "tuneable_drift.jsonl"
DRIFT_LOG_MAX_BYTES = 2 * 1024 * 1024  # 2 MB

DEFAULT_ALERT_THRESHOLD = 0.3

# Keys that change every auto-tuner run and should not count as drift
VOLATILE_KEYS: Dict[str, Set[str]] = {
    "auto_tuner": {"last_run", "tuning_log", "source_effectiveness"},
    "advisory_quality": {"updated_at", "source"},
    "advisory_preferences": {"updated_at", "source"},
}

# Top-level keys to skip entirely
SKIP_SECTIONS = {"updated_at"}

logger = logging.getLogger("spark.tuneables_drift")


@dataclass
class DriftResult:
    """Result of a drift calculation."""
    drift_score: float
    section_scores: Dict[str, float]
    key_deltas: Dict[str, Dict[str, float]]
    alert: bool = False
    threshold: float = DEFAULT_ALERT_THRESHOLD
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "ts": round(self.timestamp, 3),
            "drift_score": round(self.drift_score, 4),
            "alert": self.alert,
            "threshold": self.threshold,
            "section_scores": {k: round(v, 4) for k, v in self.section_scores.items()},
        }


def _read_json(path: Path) -> Dict[str, Any]:
    """Read JSON, return empty dict on error."""
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8-sig"))
    except (json.JSONDecodeError, OSError):
        pass
    return {}


def _key_distance(a: Any, b: Any) -> float:
    """Compute normalized distance between two values."""
    if a == b:
        return 0.0

    # Bool check before numeric (bool is subclass of int in Python)
    if isinstance(a, bool) or isinstance(b, bool):
        return 0.0 if a == b else 1.0

    # Both numeric
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        fa, fb = float(a), float(b)
        denom = max(abs(fa), abs(fb), 1e-9)
        return min(abs(fa - fb) / denom, 1.0)

    # Both string
    if isinstance(a, str) and isinstance(b, str):
        return 0.0 if a == b else 1.0

    # dict or list: deep equality
    if isinstance(a, (dict, list)) and isinstance(b, (dict, list)):
        return 0.0 if a == b else 1.0

    # Mixed types or None vs something
    return 1.0


def compute_drift(
    runtime: Optional[Dict[str, Any]] = None,
    baseline: Optional[Dict[str, Any]] = None,
    *,
    threshold: float = DEFAULT_ALERT_THRESHOLD,
) -> DriftResult:
    """Compute drift between runtime and baseline tuneables."""
    if runtime is None:
        runtime = _read_json(RUNTIME_FILE)
    if baseline is None:
        baseline = _read_json(BASELINE_FILE)

    all_sections = (set(runtime.keys()) | set(baseline.keys())) - SKIP_SECTIONS
    section_scores: Dict[str, float] = {}
    key_deltas: Dict[str, Dict[str, float]] = {}

    for section_name in sorted(all_sections):
        r_section = runtime.get(section_name, {})
        b_section = baseline.get(section_name, {})

        if not isinstance(r_section, dict) or not isinstance(b_section, dict):
            section_scores[section_name] = _key_distance(r_section, b_section)
            key_deltas[section_name] = {"_whole_section": section_scores[section_name]}
            continue

        volatile = VOLATILE_KEYS.get(section_name, set())
        all_keys = (set(r_section.keys()) | set(b_section.keys())) - volatile
        all_keys = {k for k in all_keys if not k.startswith("_")}

        if not all_keys:
            section_scores[section_name] = 0.0
            key_deltas[section_name] = {}
            continue

        section_deltas: Dict[str, float] = {}
        for key in sorted(all_keys):
            if key not in r_section or key not in b_section:
                section_deltas[key] = 1.0
            else:
                section_deltas[key] = _key_distance(r_section[key], b_section[key])

        key_deltas[section_name] = section_deltas
        section_scores[section_name] = (
            sum(section_deltas.values()) / len(section_deltas)
            if section_deltas else 0.0
        )

    drift_score = (
        sum(section_scores.values()) / len(section_scores)
        if section_scores else 0.0
    )

    return DriftResult(
        drift_score=drift_score,
        section_scores=section_scores,
        key_deltas=key_deltas,
        alert=drift_score > threshold,
        threshold=threshold,
    )


def log_drift(result: DriftResult) -> None:
    """Append drift result to ~/.spark/tuneable_drift.jsonl."""
    try:
        DRIFT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

        # Size-based rotation
        try:
            if DRIFT_LOG_FILE.exists() and DRIFT_LOG_FILE.stat().st_size > DRIFT_LOG_MAX_BYTES:
                lines = DRIFT_LOG_FILE.read_text(encoding="utf-8").strip().split("\n")
                keep = lines[len(lines) // 2:]
                DRIFT_LOG_FILE.write_text("\n".join(keep) + "\n", encoding="utf-8")
        except OSError:
            pass

        entry = result.to_dict()
        with open(DRIFT_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        logger.warning("drift log write failed: %s", e)


def check_drift(
    *,
    threshold: float = DEFAULT_ALERT_THRESHOLD,
    log: bool = True,
) -> DriftResult:
    """Compute drift, optionally log, and emit WARNING if threshold exceeded.

    This is the primary entry point for other modules.
    """
    result = compute_drift(threshold=threshold)

    if log:
        log_drift(result)

    if result.alert:
        top_sections = sorted(
            result.section_scores.items(), key=lambda x: x[1], reverse=True
        )[:5]
        top_str = ", ".join(f"{s}={v:.3f}" for s, v in top_sections if v > 0.01)
        logger.warning(
            "Tuneables drift %.3f exceeds threshold %.3f. Top: %s",
            result.drift_score, result.threshold, top_str,
        )

    return result


if __name__ == "__main__":
    r = check_drift(log=False)
    print(f"Drift score: {r.drift_score:.4f}  (alert={r.alert}, threshold={r.threshold})")
    print("\nPer-section:")
    for section, score in sorted(r.section_scores.items(), key=lambda x: -x[1]):
        if score > 0.001:
            print(f"  {section}: {score:.4f}")
            deltas = r.key_deltas.get(section, {})
            for key, d in sorted(deltas.items(), key=lambda x: -x[1]):
                if d > 0.001:
                    print(f"    {key}: {d:.4f}")
