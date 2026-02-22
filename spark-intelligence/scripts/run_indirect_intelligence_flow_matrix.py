#!/usr/bin/env python3
"""Run A/B/C/D optimization matrices for indirect intelligence-flow tuning.

This script executes four matrices:
1) Distillation quality
2) Observer policy thresholds
3) Retrieval gate stability
4) Trace attribution integrity

It applies per-arm tuneable overlays safely, runs benchmark commands, collects
metrics, writes a machine-readable JSON report, writes a markdown scorecard,
and restores baseline tuneables/policy on exit.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple


ROOT_DIR = Path(__file__).resolve().parents[1]
SPARK_DIR = Path.home() / ".spark"
TUNEABLES_PATH = SPARK_DIR / "tuneables.json"
POLICY_PATH = SPARK_DIR / "chip_observer_policy.json"
OUT_DIR = ROOT_DIR / "benchmarks" / "out"
REPORTS_DIR = ROOT_DIR / "docs" / "reports"
LOG_DIR = OUT_DIR / "matrix_v1_logs"


@dataclass
class Arm:
    code: str
    name: str
    tuneable_patch: Dict[str, Any]
    policy_thresholds: Optional[Dict[str, Any]] = None


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def deep_update(target: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            deep_update(target[key], value)
        else:
            target[key] = copy.deepcopy(value)
    return target


def apply_tuneable_patch(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    updated = copy.deepcopy(base)
    if patch:
        deep_update(updated, patch)
    updated["updated_at"] = now_utc()
    write_json(TUNEABLES_PATH, updated)
    return updated


def run_cmd(
    cmd: Sequence[str],
    *,
    log_name: str,
    timeout_s: int = 900,
) -> Dict[str, Any]:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)
    proc = subprocess.run(
        cmd,
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        timeout=timeout_s,
        env=os.environ.copy(),
    )
    ended = datetime.now(timezone.utc)
    log_path = LOG_DIR / f"{log_name}.log"
    combined = []
    combined.append(f"$ {' '.join(cmd)}")
    combined.append("")
    combined.append("=== STDOUT ===")
    combined.append(proc.stdout or "")
    combined.append("")
    combined.append("=== STDERR ===")
    combined.append(proc.stderr or "")
    log_path.write_text("\n".join(combined), encoding="utf-8")
    return {
        "cmd": list(cmd),
        "returncode": int(proc.returncode),
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "duration_s": round((ended - started).total_seconds(), 2),
        "stdout_tail": (proc.stdout or "")[-1200:],
        "stderr_tail": (proc.stderr or "")[-1200:],
        "log_file": str(log_path.relative_to(ROOT_DIR)),
    }


def parse_realism(prefix: str) -> Dict[str, Any]:
    path = OUT_DIR / f"{prefix}_report.json"
    data = read_json(path, {})
    ranked = data.get("ranked_profiles") or []
    if not ranked:
        return {"report": str(path.relative_to(ROOT_DIR)), "missing": True}
    top = ranked[0]
    realism = top.get("realism") or {}
    summary = top.get("summary") or {}
    return {
        "report": str(path.relative_to(ROOT_DIR)),
        "winner_profile": top.get("profile"),
        "objective": float(top.get("objective") or 0.0),
        "score": float(summary.get("score") or 0.0),
        "high_value_rate": float(realism.get("high_value_rate") or 0.0),
        "harmful_emit_rate": float(realism.get("harmful_emit_rate") or 0.0),
        "critical_miss_rate": float(realism.get("critical_miss_rate") or 0.0),
        "source_alignment_rate": float(realism.get("source_alignment_rate") or 0.0),
        "theory_discrimination_rate": float(realism.get("theory_discrimination_rate") or 0.0),
        "trace_bound_rate": float(realism.get("trace_bound_rate") or 0.0),
    }


def parse_diagnostics(prefix: str) -> Dict[str, Any]:
    path = OUT_DIR / f"{prefix}_report.json"
    data = read_json(path, {})
    return {
        "report": str(path.relative_to(ROOT_DIR)),
        "rows_analyzed": int(data.get("rows_analyzed") or 0),
        "merge_eligible": int(data.get("merge_eligible") or 0),
        "telemetry_rate": float(data.get("telemetry_rate") or 0.0),
        "statement_yield_rate": float(data.get("statement_yield_rate") or 0.0),
        "schema_statement_rate": float(data.get("schema_statement_rate") or 0.0),
    }


def parse_policy(prefix: str) -> Dict[str, Any]:
    path = OUT_DIR / f"{prefix}_report.json"
    data = read_json(path, {})
    disabled = data.get("disabled") or []
    keep = data.get("keep") or []
    neutral = data.get("neutral") or []
    return {
        "report": str(path.relative_to(ROOT_DIR)),
        "disabled_count": len(disabled),
        "keep_count": len(keep),
        "neutral_count": len(neutral),
        "disabled_observers": [x.get("observer") for x in disabled if isinstance(x, dict)],
        "keep_observers": [x.get("observer") for x in keep if isinstance(x, dict)],
    }


def parse_memory(prefix: str) -> Dict[str, Any]:
    path = OUT_DIR / f"{prefix}_report.json"
    data = read_json(path, {})
    out: Dict[str, Any] = {"report": str(path.relative_to(ROOT_DIR)), "winner": data.get("winner")}
    summaries = data.get("summaries") or []
    for summary in summaries:
        system = str(summary.get("system") or "")
        if not system:
            continue
        out[system] = {
            "mrr": float(summary.get("mrr") or 0.0),
            "top1_hit_rate": float(summary.get("top1_hit_rate") or 0.0),
            "non_empty_rate": float(summary.get("non_empty_rate") or 0.0),
            "latency_ms_p95": float(summary.get("latency_ms_p95") or 0.0),
        }
    return out


def parse_delta(path: Path) -> Dict[str, Any]:
    data = read_json(path, {})
    rounds = int(data.get("rounds") or 0)
    emitted = int(data.get("emitted_returns") or 0)
    emit_rate = (float(emitted) / float(rounds)) if rounds > 0 else 0.0
    engine = data.get("engine") or {}
    return {
        "report": str(path.relative_to(ROOT_DIR)),
        "rounds": rounds,
        "emitted_returns": emitted,
        "emit_rate": emit_rate,
        "engine_rows": int(engine.get("rows") or 0),
        "engine_trace_coverage_pct": float(engine.get("trace_coverage_pct") or 0.0),
        "fallback_share_pct": float(engine.get("fallback_share_pct") or 0.0),
    }


def pick_winner(matrix_id: str, arms: List[Dict[str, Any]]) -> str:
    if matrix_id == "m1_distillation":
        ranked = sorted(
            arms,
            key=lambda a: (
                float(((a.get("metrics") or {}).get("realism") or {}).get("objective") or 0.0),
                float(((a.get("metrics") or {}).get("diagnostics") or {}).get("statement_yield_rate") or 0.0),
                float(((a.get("metrics") or {}).get("delta") or {}).get("emit_rate") or 0.0),
            ),
            reverse=True,
        )
        return str((ranked[0].get("arm") if ranked else ""))
    if matrix_id == "m2_observer":
        ranked = sorted(
            arms,
            key=lambda a: (
                float(((a.get("metrics") or {}).get("realism") or {}).get("objective") or 0.0),
                int(((a.get("metrics") or {}).get("policy") or {}).get("keep_count") or 0),
                -int(((a.get("metrics") or {}).get("policy") or {}).get("disabled_count") or 0),
            ),
            reverse=True,
        )
        return str((ranked[0].get("arm") if ranked else ""))
    if matrix_id == "m3_retrieval":
        ranked = sorted(
            arms,
            key=lambda a: (
                float((((a.get("metrics") or {}).get("memory") or {}).get("hybrid_agentic") or {}).get("mrr") or 0.0),
                float(((a.get("metrics") or {}).get("realism") or {}).get("objective") or 0.0),
            ),
            reverse=True,
        )
        return str((ranked[0].get("arm") if ranked else ""))
    if matrix_id == "m4_trace":
        ranked = sorted(
            arms,
            key=lambda a: (
                float(((a.get("metrics") or {}).get("realism") or {}).get("objective") or 0.0),
                float(((a.get("metrics") or {}).get("delta") or {}).get("emit_rate") or 0.0),
                float(((a.get("metrics") or {}).get("delta") or {}).get("engine_trace_coverage_pct") or 0.0),
            ),
            reverse=True,
        )
        return str((ranked[0].get("arm") if ranked else ""))
    return ""


def matrix_definitions() -> List[Dict[str, Any]]:
    return [
        {
            "id": "m1_distillation",
            "name": "Distillation Quality",
            "arms": [
                Arm("A", "control", {}),
                Arm(
                    "B",
                    "quality_tight",
                    {
                        "chip_merge": {
                            "min_cognitive_value": 0.35,
                            "min_actionability": 0.25,
                            "min_transferability": 0.25,
                            "min_statement_len": 30,
                        }
                    },
                ),
                Arm(
                    "C",
                    "anti_churn",
                    {
                        "chip_merge": {
                            "duplicate_churn_ratio": 0.70,
                            "duplicate_churn_cooldown_s": 3600,
                        }
                    },
                ),
                Arm(
                    "D",
                    "balanced_tight",
                    {
                        "chip_merge": {
                            "min_cognitive_value": 0.35,
                            "min_actionability": 0.25,
                            "min_transferability": 0.25,
                            "min_statement_len": 30,
                            "duplicate_churn_ratio": 0.75,
                            "duplicate_churn_cooldown_s": 3600,
                        }
                    },
                ),
            ],
        },
        {
            "id": "m2_observer",
            "name": "Observer Policy Thresholds",
            "arms": [
                Arm(
                    "A",
                    "control",
                    {},
                    {
                        "disable_max_schema_statement_rate": 0.03,
                        "disable_min_telemetry_rate": 0.75,
                        "keep_min_schema_statement_rate": 0.20,
                        "keep_min_merge_eligible": 1,
                    },
                ),
                Arm(
                    "B",
                    "aggressive_disable",
                    {},
                    {
                        "disable_max_schema_statement_rate": 0.03,
                        "disable_min_telemetry_rate": 0.65,
                        "keep_min_schema_statement_rate": 0.20,
                        "keep_min_merge_eligible": 1,
                    },
                ),
                Arm(
                    "C",
                    "conservative_disable",
                    {},
                    {
                        "disable_max_schema_statement_rate": 0.03,
                        "disable_min_telemetry_rate": 0.85,
                        "keep_min_schema_statement_rate": 0.20,
                        "keep_min_merge_eligible": 1,
                    },
                ),
                Arm(
                    "D",
                    "stricter_keep_quality",
                    {},
                    {
                        "disable_max_schema_statement_rate": 0.03,
                        "disable_min_telemetry_rate": 0.75,
                        "keep_min_schema_statement_rate": 0.30,
                        "keep_min_merge_eligible": 1,
                    },
                ),
            ],
        },
        {
            "id": "m3_retrieval",
            "name": "Retrieval Gate Stability",
            "arms": [
                Arm("A", "control", {"semantic": {"min_similarity": 0.58, "min_fusion_score": 0.50}, "retrieval": {"overrides": {"lexical_weight": 0.30}}}),
                Arm("B", "mild_relax", {"semantic": {"min_similarity": 0.55, "min_fusion_score": 0.45}}),
                Arm("C", "medium_relax", {"semantic": {"min_similarity": 0.52, "min_fusion_score": 0.40}}),
                Arm(
                    "D",
                    "mild_relax_plus_lexical",
                    {
                        "semantic": {"min_similarity": 0.55, "min_fusion_score": 0.45},
                        "retrieval": {"overrides": {"lexical_weight": 0.35}},
                    },
                ),
            ],
        },
        {
            "id": "m4_trace",
            "name": "Trace Attribution Integrity",
            "arms": [
                Arm("A", "control", {"meta_ralph": {"attribution_window_s": 1200, "strict_attribution_require_trace": True}}),
                Arm("B", "tighter_window", {"meta_ralph": {"attribution_window_s": 900, "strict_attribution_require_trace": True}}),
                Arm("C", "wider_window", {"meta_ralph": {"attribution_window_s": 1800, "strict_attribution_require_trace": True}}),
                Arm(
                    "D",
                    "diagnostic_loose_trace",
                    {"meta_ralph": {"attribution_window_s": 1200, "strict_attribution_require_trace": False}},
                ),
            ],
        },
    ]


def render_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(f"# Indirect Intelligence Flow Matrix Results ({report.get('generated_at','')})")
    lines.append("")
    lines.append(f"- Run id: `{report.get('run_id','')}`")
    lines.append("")
    for matrix in report.get("matrices") or []:
        lines.append(f"## {matrix.get('name')} ({matrix.get('id')})")
        lines.append("")
        lines.append(f"- Winner: `{matrix.get('winner_arm','')}`")
        lines.append("")
        lines.append("| Arm | Name | Realism Objective | Harmful | Critical Miss | Trace | Notes |")
        lines.append("|---|---|---:|---:|---:|---:|---|")
        for arm in matrix.get("arms") or []:
            metrics = arm.get("metrics") or {}
            realism = metrics.get("realism") or {}
            notes: List[str] = []
            if metrics.get("memory"):
                mem = metrics.get("memory") or {}
                ha = (mem.get("hybrid_agentic") or {})
                notes.append(f"HA-MRR={ha.get('mrr', 0.0):.4f}")
            if metrics.get("diagnostics"):
                diag = metrics.get("diagnostics") or {}
                notes.append(f"rows={diag.get('rows_analyzed', 0)}")
                notes.append(f"telemetry={diag.get('telemetry_rate', 0.0):.2f}")
            if metrics.get("delta"):
                delta = metrics.get("delta") or {}
                notes.append(f"emit={delta.get('emit_rate', 0.0):.2%}")
            lines.append(
                f"| {arm.get('arm','')} | {arm.get('name','')} | "
                f"{float(realism.get('objective') or 0.0):.4f} | "
                f"{float(realism.get('harmful_emit_rate') or 0.0):.4f} | "
                f"{float(realism.get('critical_miss_rate') or 0.0):.4f} | "
                f"{float(realism.get('trace_bound_rate') or 0.0):.4f} | "
                f"{'; '.join(notes)} |"
            )
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def execute_matrix(
    matrix: Dict[str, Any],
    *,
    py: str,
    run_id: str,
    baseline_tuneables: Dict[str, Any],
    command_timeout_s: int,
) -> Dict[str, Any]:
    matrix_id = str(matrix["id"])
    out: Dict[str, Any] = {"id": matrix_id, "name": matrix["name"], "arms": []}
    for arm in matrix["arms"]:
        assert isinstance(arm, Arm)
        arm_id = f"{matrix_id}_{arm.code}_{arm.name}"
        metrics: Dict[str, Any] = {}
        commands: List[Dict[str, Any]] = []
        errors: List[str] = []

        # Always start arm from baseline tuneables.
        apply_tuneable_patch(baseline_tuneables, arm.tuneable_patch)

        try:
            if matrix_id in {"m1_distillation", "m2_observer"}:
                diag_prefix = f"{run_id}_{arm_id}_diag"
                cmd = [
                    py,
                    "scripts/run_chip_learning_diagnostics.py",
                    "--limit-per-chip",
                    "220",
                    "--active-only",
                    "--project-path",
                    str(ROOT_DIR),
                    "--max-age-days",
                    "14",
                    "--observer-limit",
                    "25",
                    "--out-prefix",
                    diag_prefix,
                ]
                commands.append(run_cmd(cmd, log_name=f"{arm_id}_diag"))
                metrics["diagnostics"] = parse_diagnostics(diag_prefix)

            if matrix_id == "m2_observer":
                policy_prefix = f"{run_id}_{arm_id}_policy"
                th = arm.policy_thresholds or {}
                cmd = [
                    py,
                    "scripts/run_chip_observer_policy.py",
                    "--report-glob",
                    "benchmarks/out/chip_learning_diagnostics_*_report.json",
                    "--windows",
                    "6",
                    "--min-windows",
                    "2",
                    "--min-rows-total",
                    "20",
                    "--disable-max-schema-statement-rate",
                    str(th.get("disable_max_schema_statement_rate", 0.03)),
                    "--disable-min-telemetry-rate",
                    str(th.get("disable_min_telemetry_rate", 0.75)),
                    "--keep-min-schema-statement-rate",
                    str(th.get("keep_min_schema_statement_rate", 0.20)),
                    "--keep-min-merge-eligible",
                    str(th.get("keep_min_merge_eligible", 1)),
                    "--out-prefix",
                    policy_prefix,
                    "--apply",
                ]
                commands.append(run_cmd(cmd, log_name=f"{arm_id}_policy", timeout_s=command_timeout_s))
                metrics["policy"] = parse_policy(policy_prefix)

            if matrix_id == "m3_retrieval":
                mem_prefix = f"{run_id}_{arm_id}_memory"
                cmd = [
                    py,
                    "benchmarks/memory_retrieval_ab.py",
                    "--cases",
                    "benchmarks/data/memory_retrieval_eval_real_user_2026_02_12.json",
                    "--systems",
                    "embeddings_only,hybrid,hybrid_agentic",
                    "--top-k",
                    "5",
                    "--strict-labels",
                    "--out-prefix",
                    mem_prefix,
                ]
                commands.append(run_cmd(cmd, log_name=f"{arm_id}_memory", timeout_s=command_timeout_s))
                metrics["memory"] = parse_memory(mem_prefix)

            if matrix_id in {"m1_distillation", "m4_trace"}:
                delta_path = REPORTS_DIR / f"{run_id}_{arm_id}_delta.json"
                rounds = "24" if matrix_id == "m1_distillation" else "32"
                cmd = [
                    py,
                    "scripts/advisory_controlled_delta.py",
                    "--rounds",
                    rounds,
                    "--label",
                    f"{run_id}_{arm_id}",
                    "--out",
                    str(delta_path),
                ]
                commands.append(run_cmd(cmd, log_name=f"{arm_id}_delta", timeout_s=command_timeout_s))
                metrics["delta"] = parse_delta(delta_path)

            realism_prefix = f"{run_id}_{arm_id}_realism"
            cmd = [
                py,
                "benchmarks/advisory_realism_bench.py",
                "--cases",
                "benchmarks/data/advisory_realism_eval_v2.json",
                "--profiles",
                "baseline",
                "--repeats",
                "1",
                "--out-prefix",
                realism_prefix,
            ]
            commands.append(run_cmd(cmd, log_name=f"{arm_id}_realism", timeout_s=command_timeout_s))
            metrics["realism"] = parse_realism(realism_prefix)

            for command in commands:
                if int(command.get("returncode") or 0) != 0:
                    errors.append(f"non-zero return code ({command.get('returncode')}) for {command.get('log_file')}")
        except subprocess.TimeoutExpired as ex:
            errors.append(f"timeout: {ex}")
        except Exception as ex:  # pragma: no cover - defensive capture for long matrix runs
            errors.append(f"exception: {ex}")

        out["arms"].append(
            {
                "arm": arm.code,
                "name": arm.name,
                "tuneable_patch": arm.tuneable_patch,
                "policy_thresholds": arm.policy_thresholds,
                "commands": commands,
                "metrics": metrics,
                "errors": errors,
            }
        )

    out["winner_arm"] = pick_winner(matrix_id, out["arms"])
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Run indirect intelligence flow A/B/C/D matrices")
    ap.add_argument("--run-id", default=f"indirect_matrix_v1_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}")
    ap.add_argument("--timeout-s", type=int, default=900, help="Per-command timeout in seconds")
    args = ap.parse_args()

    if not TUNEABLES_PATH.exists():
        raise SystemExit(f"Missing tuneables: {TUNEABLES_PATH}")

    py = sys.executable
    run_id = str(args.run_id)
    baseline_tuneables = read_json(TUNEABLES_PATH, {})
    baseline_policy_text = POLICY_PATH.read_text(encoding="utf-8") if POLICY_PATH.exists() else None

    report: Dict[str, Any] = {
        "generated_at": now_utc(),
        "run_id": run_id,
        "baseline_tuneables_file": str(TUNEABLES_PATH),
        "baseline_policy_file": str(POLICY_PATH),
        "matrices": [],
    }

    try:
        for matrix in matrix_definitions():
            print(f"[matrix] start {matrix['id']}")
            result = execute_matrix(
                matrix,
                py=py,
                run_id=run_id,
                baseline_tuneables=baseline_tuneables,
                command_timeout_s=max(60, int(args.timeout_s)),
            )
            report["matrices"].append(result)
            print(f"[matrix] done {matrix['id']} winner={result.get('winner_arm')}")
    finally:
        # Always restore original state.
        write_json(TUNEABLES_PATH, baseline_tuneables)
        if baseline_policy_text is not None:
            POLICY_PATH.write_text(baseline_policy_text, encoding="utf-8")
        elif POLICY_PATH.exists():
            try:
                POLICY_PATH.unlink()
            except Exception:
                pass

    json_path = OUT_DIR / f"{run_id}_results.json"
    md_path = REPORTS_DIR / f"{run_id}_scorecard.md"
    write_json(json_path, report)
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(render_markdown(report), encoding="utf-8")

    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

