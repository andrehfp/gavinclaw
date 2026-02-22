#!/usr/bin/env python3
"""Run chip schema experiments across multiple random seeds.

This reduces overfitting to a single synthetic seed and reports:
- winner frequency per arm
- mean/stdev objective and coverage metrics
- promotion gate pass rate across windows
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parents[1]
BENCH_DIR = ROOT / "benchmarks"
DEFAULT_PLAN = BENCH_DIR / "data" / "chip_schema_experiment_plan_v1.json"
BASE_SCRIPT = ROOT / "scripts" / "run_chip_schema_experiments.py"


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return int(default)


def _mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return float(sum(values) / max(1, len(values)))


def _pstdev(values: List[float]) -> float:
    if len(values) <= 1:
        return 0.0
    mu = _mean(values)
    var = sum((float(v) - mu) ** 2 for v in values) / float(len(values))
    return math.sqrt(var)


def _load_base_module():
    spec = importlib.util.spec_from_file_location("run_chip_schema_experiments_base", BASE_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"failed to load base module: {BASE_SCRIPT}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def _parse_seeds(args: argparse.Namespace) -> List[int]:
    text = str(args.seeds or "").strip()
    if text:
        out: List[int] = []
        for part in text.split(","):
            part = part.strip()
            if not part:
                continue
            out.append(int(part))
        if out:
            return out
    start = int(args.seed_start)
    count = max(1, int(args.seed_count))
    return [start + i for i in range(count)]


def _aggregate(seed_reports: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_id: Dict[str, Dict[str, Any]] = {}
    for rep in seed_reports:
        winner_id = str(rep.get("winner_id") or "")
        for row in rep.get("experiments") or []:
            exp_id = str(row.get("id") or "")
            if not exp_id:
                continue
            slot = by_id.setdefault(
                exp_id,
                {
                    "id": exp_id,
                    "mode": str(row.get("mode") or exp_id),
                    "wins": 0,
                    "runs": 0,
                    "objective": [],
                    "capture_coverage": [],
                    "schema_statement_rate": [],
                    "merge_eligible_rate": [],
                    "non_telemetry_rate": [],
                    "payload_valid_emission_rate": [],
                },
            )
            slot["runs"] += 1
            if exp_id == winner_id:
                slot["wins"] += 1
            slot["objective"].append(_safe_float(row.get("objective"), 0.0))
            slot["capture_coverage"].append(_safe_float(row.get("capture_coverage"), 0.0))
            slot["schema_statement_rate"].append(_safe_float(row.get("schema_statement_rate"), 0.0))
            slot["merge_eligible_rate"].append(_safe_float(row.get("merge_eligible_rate"), 0.0))
            slot["non_telemetry_rate"].append(1.0 - _safe_float(row.get("telemetry_rate"), 1.0))
            slot["payload_valid_emission_rate"].append(_safe_float(row.get("payload_valid_emission_rate"), 0.0))

    out: List[Dict[str, Any]] = []
    for _, slot in by_id.items():
        runs = max(1, _safe_int(slot.get("runs"), 0))
        row = {
            "id": slot["id"],
            "mode": slot["mode"],
            "runs": runs,
            "wins": _safe_int(slot.get("wins"), 0),
            "win_rate": round(_safe_int(slot.get("wins"), 0) / runs, 4),
            "objective_mean": round(_mean(slot["objective"]), 4),
            "objective_stdev": round(_pstdev(slot["objective"]), 4),
            "coverage_mean": round(_mean(slot["capture_coverage"]), 4),
            "coverage_stdev": round(_pstdev(slot["capture_coverage"]), 4),
            "schema_statement_mean": round(_mean(slot["schema_statement_rate"]), 4),
            "merge_eligible_mean": round(_mean(slot["merge_eligible_rate"]), 4),
            "non_telemetry_mean": round(_mean(slot["non_telemetry_rate"]), 4),
            "payload_valid_mean": round(_mean(slot["payload_valid_emission_rate"]), 4),
        }
        out.append(row)
    out.sort(key=lambda r: (float(r.get("objective_mean", 0.0)), float(r.get("coverage_mean", 0.0))), reverse=True)
    return out


def _render_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(f"# Chip Schema Multi-Seed ({report.get('generated_at', '')})")
    lines.append("")
    lines.append(f"- Plan: `{report.get('plan_path', '')}`")
    lines.append(f"- Chips: `{', '.join(report.get('chips') or [])}`")
    lines.append(f"- Seeds: `{', '.join(str(s) for s in (report.get('seeds') or []))}`")
    lines.append(f"- Events per chip: `{int(report.get('events_per_chip', 0))}`")
    lines.append(
        f"- Promotion gate pass rate (`{report.get('promotion_candidate_id','')}` vs `{report.get('promotion_baseline_id','')}`): "
        f"`{float(report.get('promotion_pass_rate', 0.0)):.2%}` "
        f"({int(report.get('promotion_pass_count', 0))}/{int(report.get('seed_count', 0))})"
    )
    lines.append("")
    lines.append("| Rank | Experiment | Win Rate | Objective (meanÂ±sd) | Coverage (meanÂ±sd) | Schema Statement | Merge Eligible | Non-Telemetry | Payload Valid |")
    lines.append("|---|---|---:|---:|---:|---:|---:|---:|---:|")
    for idx, row in enumerate(report.get("aggregated") or [], start=1):
        lines.append(
            f"| {idx} | `{row.get('id','')}` ({row.get('mode','')}) | {float(row.get('win_rate',0.0)):.2%} | "
            f"{float(row.get('objective_mean',0.0)):.4f} Â± {float(row.get('objective_stdev',0.0)):.4f} | "
            f"{float(row.get('coverage_mean',0.0)):.2%} Â± {float(row.get('coverage_stdev',0.0)):.2%} | "
            f"{float(row.get('schema_statement_mean',0.0)):.2%} | {float(row.get('merge_eligible_mean',0.0)):.2%} | "
            f"{float(row.get('non_telemetry_mean',0.0)):.2%} | {float(row.get('payload_valid_mean',0.0)):.2%} |"
        )
    lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Run chip schema experiments over multiple random seeds")
    ap.add_argument("--plan", default=str(DEFAULT_PLAN), help="Path to schema experiment plan JSON")
    ap.add_argument("--chips", default="social-convo,engagement-pulse,x_social", help="Comma-separated chip ids")
    ap.add_argument("--events-per-chip", type=int, default=24, help="Synthetic events generated per chip per experiment")
    ap.add_argument("--min-total-score", type=float, default=None, help="Threshold for merge-eligible counting (default: plan value, else 0.55)")
    ap.add_argument("--seeds", default="", help="Comma-separated explicit seeds (overrides --seed-start/count)")
    ap.add_argument("--seed-start", type=int, default=20260213, help="Seed range start when --seeds omitted")
    ap.add_argument("--seed-count", type=int, default=5, help="How many consecutive seeds to run when --seeds omitted")
    ap.add_argument("--promotion-baseline-id", default="A_schema_baseline", help="Baseline arm ID for promotion gate")
    ap.add_argument("--promotion-candidate-id", default="B_schema_evidence2", help="Candidate arm ID for promotion gate")
    ap.add_argument("--min-objective-delta", type=float, default=0.0, help="Promotion requires candidate objective delta > this")
    ap.add_argument("--min-coverage-delta", type=float, default=0.0, help="Promotion requires candidate coverage delta > this")
    ap.add_argument("--min-candidate-non-telemetry", type=float, default=0.0, help="Promotion requires candidate non-telemetry rate >= this")
    ap.add_argument("--min-candidate-schema-statement", type=float, default=0.0, help="Promotion requires candidate schema statement rate >= this")
    ap.add_argument("--min-candidate-merge-eligible", type=float, default=0.0, help="Promotion requires candidate merge-eligible rate >= this")
    ap.add_argument("--out-prefix", default="chip_schema_multiseed_v1", help="Output file prefix under benchmarks/out")
    args = ap.parse_args()

    base = _load_base_module()
    plan_path = Path(args.plan)
    plan = base._load_plan(plan_path)
    experiments = [e for e in (plan.get("experiments") or []) if isinstance(e, dict)]
    weights = dict(plan.get("objective_weights") or {})
    chosen_min_total_score = (
        float(args.min_total_score)
        if args.min_total_score is not None
        else float(plan.get("min_total_score", 0.55))
    )
    chips = [c.strip() for c in str(args.chips or "").split(",") if c.strip()]
    if not chips:
        raise ValueError("no chips specified")
    seeds = _parse_seeds(args)

    seed_reports: List[Dict[str, Any]] = []
    promotion_pass_count = 0
    with tempfile.TemporaryDirectory(prefix="chip_schema_multiseed_", dir=str(ROOT)) as tmp:
        tmp_dir = Path(tmp)
        for seed in seeds:
            rows: List[Dict[str, Any]] = []
            for exp in experiments:
                row = base._run_experiment(
                    exp=exp,
                    weights=weights,
                    chips=chips,
                    events_per_chip=max(1, int(args.events_per_chip)),
                    min_total_score=max(0.0, min(1.0, float(chosen_min_total_score))),
                    base_seed=int(seed),
                    tmp_dir=tmp_dir / f"seed_{seed}",
                )
                rows.append(row)
            ranked = sorted(rows, key=lambda r: base._safe_float(r.get("objective"), 0.0), reverse=True)
            gate = base._evaluate_promotion_gate(
                rows,
                baseline_id=str(args.promotion_baseline_id),
                candidate_id=str(args.promotion_candidate_id),
                min_objective_delta=float(args.min_objective_delta),
                min_coverage_delta=float(args.min_coverage_delta),
                min_candidate_non_telemetry=float(args.min_candidate_non_telemetry),
                min_candidate_schema_statement=float(args.min_candidate_schema_statement),
                min_candidate_merge_eligible=float(args.min_candidate_merge_eligible),
            )
            if bool(gate.get("passed")):
                promotion_pass_count += 1
            seed_reports.append(
                {
                    "seed": int(seed),
                    "winner_id": str((ranked[0] if ranked else {}).get("id") or ""),
                    "promotion_gate": gate,
                    "experiments": rows,
                }
            )

    aggregated = _aggregate(seed_reports)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "plan_path": str(plan_path),
        "chips": chips,
        "events_per_chip": int(args.events_per_chip),
        "min_total_score": float(chosen_min_total_score),
        "seeds": seeds,
        "seed_count": len(seeds),
        "promotion_baseline_id": str(args.promotion_baseline_id),
        "promotion_candidate_id": str(args.promotion_candidate_id),
        "promotion_pass_count": int(promotion_pass_count),
        "promotion_pass_rate": round(int(promotion_pass_count) / max(1, len(seeds)), 4),
        "objective_weights": weights,
        "aggregated": aggregated,
        "seed_reports": seed_reports,
    }

    out_dir = ROOT / "benchmarks" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{args.out_prefix}_report.json"
    md_path = out_dir / f"{args.out_prefix}_report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(_render_markdown(report), encoding="utf-8")

    leader = (aggregated[0] if aggregated else {})
    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    print(
        "Leader="
        f"{leader.get('id', 'n/a')} "
        f"objective_mean={_safe_float(leader.get('objective_mean'), 0.0):.4f} "
        f"coverage_mean={_safe_float(leader.get('coverage_mean'), 0.0):.2%} "
        f"win_rate={_safe_float(leader.get('win_rate'), 0.0):.2%}"
    )
    print(
        "PromotionPassRate="
        f"{_safe_float(report.get('promotion_pass_rate'), 0.0):.2%} "
        f"candidate={report.get('promotion_candidate_id','')} "
        f"baseline={report.get('promotion_baseline_id','')}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

