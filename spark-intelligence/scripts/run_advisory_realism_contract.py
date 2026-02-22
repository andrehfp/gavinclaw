#!/usr/bin/env python3
"""Run advisory realism primary+shadow contract and print a compact dashboard."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTRACT = ROOT / "benchmarks" / "data" / "advisory_realism_operating_contract_v1.json"
OUT_DIR = ROOT / "benchmarks" / "out"


@dataclass
class WinnerSummary:
    profile: str
    objective: float
    score: float
    high_value_rate: float
    harmful_emit_rate: float
    critical_miss_rate: float
    source_alignment_rate: float
    theory_discrimination_rate: float
    trace_bound_rate: float
    all_gates_pass: bool
    gates: Dict[str, bool]


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return float(default)


def _load_json(path: Path) -> Dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"expected object JSON in {path}")
    return raw


def _summarize_report(report: Dict[str, Any]) -> WinnerSummary:
    winner = report.get("winner") or {}
    summary = winner.get("summary") or {}
    realism = winner.get("realism") or {}
    gate_rows = winner.get("gates") or {}
    gates: Dict[str, bool] = {}
    for key, row in dict(gate_rows).items():
        ok = bool((row or {}).get("ok"))
        gates[str(key)] = ok
    all_pass = bool(gates) and all(gates.values())
    return WinnerSummary(
        profile=str(winner.get("profile") or "n/a"),
        objective=_safe_float(winner.get("objective"), 0.0),
        score=_safe_float(summary.get("score"), 0.0),
        high_value_rate=_safe_float(realism.get("high_value_rate"), 0.0),
        harmful_emit_rate=_safe_float(realism.get("harmful_emit_rate"), 1.0),
        critical_miss_rate=_safe_float(realism.get("critical_miss_rate"), 1.0),
        source_alignment_rate=_safe_float(realism.get("source_alignment_rate"), 0.0),
        theory_discrimination_rate=_safe_float(realism.get("theory_discrimination_rate"), 0.0),
        trace_bound_rate=_safe_float(realism.get("trace_bound_rate"), 0.0),
        all_gates_pass=all_pass,
        gates=gates,
    )


def _build_cmd(*, cases: str, profiles: str, repeats: int, force_live: bool, out_prefix: str) -> list[str]:
    cmd = [
        sys.executable,
        str(ROOT / "benchmarks" / "advisory_realism_bench.py"),
        "--cases",
        str(cases),
        "--profiles",
        str(profiles),
        "--repeats",
        str(int(repeats)),
        "--out-prefix",
        str(out_prefix),
    ]
    if force_live:
        cmd.append("--force-live")
    return cmd


def _run_benchmark(cmd: list[str], *, timeout_s: int | None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(ROOT), text=True, check=False, timeout=timeout_s)


def _print_summary(label: str, summary: WinnerSummary) -> None:
    state = "PASS" if summary.all_gates_pass else "FAIL"
    print(f"{label}: {state} winner={summary.profile} objective={summary.objective:.4f} score={summary.score:.4f}")
    print(
        "  metrics:"
        f" high_value={summary.high_value_rate:.2%}"
        f" harmful_emit={summary.harmful_emit_rate:.2%}"
        f" critical_miss={summary.critical_miss_rate:.2%}"
        f" source_align={summary.source_alignment_rate:.2%}"
        f" theory_disc={summary.theory_discrimination_rate:.2%}"
        f" trace={summary.trace_bound_rate:.2%}"
    )
    gate_view = ", ".join([f"{k}={'ok' if v else 'fail'}" for k, v in sorted(summary.gates.items())]) or "none"
    print(f"  gates: {gate_view}")


def _delta(primary: WinnerSummary, shadow: WinnerSummary) -> Dict[str, float]:
    return {
        "objective": round(primary.objective - shadow.objective, 4),
        "score": round(primary.score - shadow.score, 4),
        "high_value_rate": round(primary.high_value_rate - shadow.high_value_rate, 4),
        "harmful_emit_rate": round(primary.harmful_emit_rate - shadow.harmful_emit_rate, 4),
        "critical_miss_rate": round(primary.critical_miss_rate - shadow.critical_miss_rate, 4),
        "source_alignment_rate": round(primary.source_alignment_rate - shadow.source_alignment_rate, 4),
        "theory_discrimination_rate": round(primary.theory_discrimination_rate - shadow.theory_discrimination_rate, 4),
        "trace_bound_rate": round(primary.trace_bound_rate - shadow.trace_bound_rate, 4),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Run advisory realism primary+shadow contract")
    ap.add_argument("--contract", default=str(DEFAULT_CONTRACT), help="Contract JSON path")
    ap.add_argument("--primary-prefix", default="advisory_realism_primary_contract", help="Out prefix for primary run")
    ap.add_argument("--shadow-prefix", default="advisory_realism_shadow_contract", help="Out prefix for shadow run")
    ap.add_argument("--profiles", default="", help="Override profiles comma list")
    live = ap.add_mutually_exclusive_group(required=False)
    live.add_argument(
        "--force-live",
        action="store_true",
        help="Override contract runtime and force live advisory retrieval",
    )
    live.add_argument(
        "--no-force-live",
        action="store_true",
        help="Override contract runtime and disable live advisory retrieval (uses packet path)",
    )
    ap.add_argument(
        "--repeats",
        type=int,
        default=0,
        help="Override contract repeats (0 means use contract value)",
    )
    ap.add_argument(
        "--run-timeout-s",
        type=int,
        default=1800,
        help="Timeout per benchmark run in seconds (0 disables timeout)",
    )
    args = ap.parse_args()

    contract = _load_json(Path(args.contract))
    primary_cases = str(contract.get("primary_cases") or "")
    shadow_cases = str(contract.get("shadow_cases") or "")
    if not primary_cases or not shadow_cases:
        raise ValueError("contract requires primary_cases and shadow_cases")

    runtime = contract.get("runtime") or {}
    repeats = int(runtime.get("repeats") or 1)
    force_live = bool(runtime.get("force_live", True))

    # CLI overrides (useful when force-live hangs or when we want deterministic local runs).
    if int(args.repeats or 0) > 0:
        repeats = max(1, int(args.repeats))
    if bool(args.force_live):
        force_live = True
    if bool(args.no_force_live):
        force_live = False
    profiles = ",".join(contract.get("profiles") or ["baseline", "balanced", "strict"])
    if str(args.profiles or "").strip():
        profiles = str(args.profiles).strip()

    runs = [
        ("PRIMARY", _build_cmd(cases=primary_cases, profiles=profiles, repeats=repeats, force_live=force_live, out_prefix=str(args.primary_prefix))),
        ("SHADOW", _build_cmd(cases=shadow_cases, profiles=profiles, repeats=repeats, force_live=force_live, out_prefix=str(args.shadow_prefix))),
    ]
    timeout_s = None if int(args.run_timeout_s) <= 0 else int(args.run_timeout_s)

    for label, cmd in runs:
        started = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{started}] starting {label} run...")
        try:
            proc = _run_benchmark(cmd, timeout_s=timeout_s)
        except subprocess.TimeoutExpired:
            print(f"{label} run timed out after {timeout_s}s", file=sys.stderr)
            return 124
        if proc.returncode != 0:
            print(f"{label} run failed (exit={proc.returncode})", file=sys.stderr)
            return int(proc.returncode or 1)
        ended = time.strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{ended}] {label} run completed")

    primary_report_path = OUT_DIR / f"{args.primary_prefix}_report.json"
    shadow_report_path = OUT_DIR / f"{args.shadow_prefix}_report.json"
    primary_report = _load_json(primary_report_path)
    shadow_report = _load_json(shadow_report_path)
    primary = _summarize_report(primary_report)
    shadow = _summarize_report(shadow_report)

    print("Advisory Realism Contract Dashboard")
    print(f"- contract: {Path(args.contract)}")
    print(f"- profiles: {profiles}")
    _print_summary("PRIMARY", primary)
    _print_summary("SHADOW", shadow)
    print(f"DELTA(primary-shadow): {_delta(primary, shadow)}")

    if not primary.all_gates_pass:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
