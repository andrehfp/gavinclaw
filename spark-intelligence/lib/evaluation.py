"""Lightweight evaluation helpers (no external deps)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, List

from lib.outcome_log import OUTCOMES_FILE
from lib.prediction_loop import PREDICTIONS_FILE


def _load_jsonl(path: Path, limit: int = 800) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except Exception:
        return []
    out: List[Dict[str, Any]] = []
    for line in reversed(lines[-limit:]):
        try:
            out.append(json.loads(line))
        except Exception:
            continue
    return out


def _normalize(text: str) -> str:
    return (text or "").lower().strip()


def _token_overlap(a: str, b: str) -> float:
    a_t = set(_normalize(a).split())
    b_t = set(_normalize(b).split())
    if not a_t or not b_t:
        return 0.0
    return len(a_t & b_t) / max(1, len(a_t | b_t))


def evaluate_predictions(
    *,
    max_age_s: float = 7 * 24 * 3600,
    sim_threshold: float = 0.72,
) -> Dict[str, Any]:
    """Compute lightweight evaluation metrics from predictions/outcomes."""
    preds = _load_jsonl(PREDICTIONS_FILE, limit=800)
    outcomes = _load_jsonl(OUTCOMES_FILE, limit=800)
    if not preds or not outcomes:
        return {
            "predictions": len(preds),
            "outcomes": len(outcomes),
            "matched": 0,
            "validated": 0,
            "contradicted": 0,
            "outcome_coverage": 0.0,
            "precision": 0.0,
        }

    now = time.time()
    preds = [p for p in preds if (now - float(p.get("created_at") or 0.0)) <= max_age_s]
    outcomes = [o for o in outcomes if (now - float(o.get("created_at") or 0.0)) <= max_age_s]

    matched = 0
    validated = 0
    contradicted = 0

    pred_texts = [p.get("text") or "" for p in preds]
    out_texts = [o.get("text") or "" for o in outcomes]

    for i, pred in enumerate(preds):
        best = None
        best_sim = 0.0
        insight_key = pred.get("insight_key")
        if insight_key:
            linked = [o for o in outcomes if isinstance(o.get("linked_insights"), list) and insight_key in o.get("linked_insights")]
            if linked:
                linked.sort(key=lambda o: float(o.get("created_at") or 0.0), reverse=True)
                best = linked[0]
                best_sim = 1.0
        entity_id = pred.get("entity_id")
        if entity_id:
            linked_entity = [o for o in outcomes if o.get("entity_id") == entity_id]
            if linked_entity:
                linked_entity.sort(key=lambda o: float(o.get("created_at") or 0.0), reverse=True)
                best = linked_entity[0]
                best_sim = 1.0
        pred_sid = pred.get("session_id")
        cand_indices = list(range(len(outcomes)))
        if pred_sid:
            same = [idx for idx, o in enumerate(outcomes) if o.get("session_id") == pred_sid]
            if same:
                cand_indices = same
        for j in cand_indices:
            outcome = outcomes[j]
            if best is not None:
                break
            if outcome.get("created_at") and pred.get("created_at"):
                if float(outcome["created_at"]) < float(pred["created_at"]):
                    continue
            sim = _token_overlap(pred_texts[i], out_texts[j])
            if sim > best_sim:
                best_sim = sim
                best = outcome
        if not best or best_sim < sim_threshold:
            continue
        out_pol = best.get("polarity")
        if out_pol not in ("pos", "neg"):
            continue
        matched += 1
        pred_pol = pred.get("expected_polarity")
        pred_type = pred.get("type") or "general"
        if pred_type == "failure_pattern":
            validated += 1
        elif pred_pol == out_pol:
            validated += 1
        else:
            contradicted += 1

    outcome_coverage = (matched / len(outcomes)) if outcomes else 0.0
    precision = (validated / matched) if matched else 0.0

    return {
        "predictions": len(preds),
        "outcomes": len(outcomes),
        "matched": matched,
        "validated": validated,
        "contradicted": contradicted,
        "outcome_coverage": outcome_coverage,
        "precision": precision,
    }
