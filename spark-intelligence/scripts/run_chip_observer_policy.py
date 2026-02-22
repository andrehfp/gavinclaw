#!/usr/bin/env python3
"""Generate keep/disable observer policy from recent diagnostics windows.

Policy is derived from observer KPI trends across the last N diagnostic reports.
This helps suppress persistently noisy observers without manual guesswork.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "benchmarks" / "out"
DEFAULT_POLICY_FILE = Path.home() / ".spark" / "chip_observer_policy.json"


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


def _load_reports(report_glob: str, windows: int) -> List[Tuple[Path, Dict[str, Any]]]:
    files = sorted((ROOT / report_glob).glob("*") if "*" not in report_glob else [], key=lambda p: p.stat().st_mtime)
    # If glob includes directories/wildcards directly, fallback to rglob through root.
    if not files:
        files = sorted(ROOT.glob(report_glob), key=lambda p: p.stat().st_mtime)
    out: List[Tuple[Path, Dict[str, Any]]] = []
    for fp in files[-max(1, int(windows)) :]:
        try:
            payload = json.loads(fp.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(payload, dict):
            out.append((fp, payload))
    return out


def _summarize(report_rows: List[Tuple[Path, Dict[str, Any]]]) -> Dict[str, Dict[str, Any]]:
    observed: Dict[str, Dict[str, Any]] = {}
    for fp, payload in report_rows:
        for row in payload.get("observers") or []:
            if not isinstance(row, dict):
                continue
            key = str(row.get("observer") or "").strip().lower()
            if not key:
                continue
            slot = observed.setdefault(
                key,
                {
                    "observer": key,
                    "windows": 0,
                    "rows_total": 0,
                    "schema_statement_rates": [],
                    "schema_payload_rates": [],
                    "telemetry_rates": [],
                    "merge_eligible_counts": [],
                    "reports": [],
                },
            )
            slot["windows"] += 1
            slot["rows_total"] += _safe_int(row.get("rows"), 0)
            slot["schema_statement_rates"].append(_safe_float(row.get("schema_statement_rate"), 0.0))
            slot["schema_payload_rates"].append(_safe_float(row.get("schema_payload_rate"), 0.0))
            slot["telemetry_rates"].append(_safe_float(row.get("telemetry_rate"), 0.0))
            slot["merge_eligible_counts"].append(_safe_int(row.get("merge_eligible"), 0))
            slot["reports"].append(fp.name)
    return observed


def _mean(values: List[float]) -> float:
    if not values:
        return 0.0
    return float(sum(values) / max(1, len(values)))


def _evaluate(
    observed: Dict[str, Dict[str, Any]],
    *,
    min_windows: int,
    min_rows_total: int,
    disable_max_schema_statement_rate: float,
    disable_min_telemetry_rate: float,
    keep_min_schema_statement_rate: float,
    keep_min_merge_eligible: int,
) -> Dict[str, Any]:
    disabled: List[Dict[str, Any]] = []
    keep: List[Dict[str, Any]] = []
    neutral: List[Dict[str, Any]] = []

    for key, row in observed.items():
        windows = _safe_int(row.get("windows"), 0)
        rows_total = _safe_int(row.get("rows_total"), 0)
        schema_statement_avg = _mean(list(row.get("schema_statement_rates") or []))
        schema_payload_avg = _mean(list(row.get("schema_payload_rates") or []))
        telemetry_avg = _mean(list(row.get("telemetry_rates") or []))
        merge_total = int(sum(int(v or 0) for v in (row.get("merge_eligible_counts") or [])))

        base = {
            "observer": key,
            "windows": windows,
            "rows_total": rows_total,
            "schema_statement_avg": round(schema_statement_avg, 4),
            "schema_payload_avg": round(schema_payload_avg, 4),
            "telemetry_avg": round(telemetry_avg, 4),
            "merge_eligible_total": merge_total,
            "reports": list(row.get("reports") or []),
        }

        if (
            windows >= min_windows
            and rows_total >= min_rows_total
            and schema_statement_avg <= disable_max_schema_statement_rate
            and telemetry_avg >= disable_min_telemetry_rate
            and merge_total <= 0
        ):
            base["decision"] = "disable"
            disabled.append(base)
            continue

        if schema_statement_avg >= keep_min_schema_statement_rate or merge_total >= keep_min_merge_eligible:
            base["decision"] = "keep"
            keep.append(base)
            continue

        base["decision"] = "neutral"
        neutral.append(base)

    disabled.sort(key=lambda r: (r["schema_statement_avg"], -r["telemetry_avg"], -r["rows_total"]))
    keep.sort(key=lambda r: (r["schema_statement_avg"], r["merge_eligible_total"], r["rows_total"]), reverse=True)
    neutral.sort(key=lambda r: (r["schema_statement_avg"], r["rows_total"]), reverse=True)
    return {"disabled": disabled, "keep": keep, "neutral": neutral}


def _split_observer_key(value: str) -> Tuple[str, str]:
    text = str(value or "").strip().lower()
    if "/" not in text:
        return "", text
    chip_id, observer = text.split("/", 1)
    return chip_id.strip().replace("_", "-"), observer.strip()


def _policy_payload(
    *,
    report_paths: List[str],
    disabled_rows: List[Dict[str, Any]],
    keep_rows: List[Dict[str, Any]],
    windows: int,
    thresholds: Dict[str, Any],
) -> Dict[str, Any]:
    disabled_observers: List[str] = []
    disabled_names: List[str] = []
    for row in disabled_rows:
        key = str(row.get("observer") or "").strip().lower()
        if not key:
            continue
        chip_id, observer = _split_observer_key(key)
        if chip_id and observer:
            disabled_observers.append(f"{chip_id}/{observer}")
        if observer:
            disabled_names.append(observer)

    keep_observers: List[str] = []
    for row in keep_rows:
        key = str(row.get("observer") or "").strip().lower()
        if not key:
            continue
        chip_id, observer = _split_observer_key(key)
        if chip_id and observer:
            keep_observers.append(f"{chip_id}/{observer}")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "windows_analyzed": int(windows),
        "source_reports": report_paths,
        "thresholds": thresholds,
        "disabled_observers": sorted(set(disabled_observers)),
        "disabled_observer_names": sorted(set(disabled_names)),
        "keep_observers": sorted(set(keep_observers)),
    }


def _report_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(f"# Chip Observer Policy ({report.get('generated_at', '')})")
    lines.append("")
    lines.append(f"- Windows analyzed: `{int(report.get('windows_analyzed', 0))}`")
    lines.append(f"- Source reports: `{', '.join(report.get('source_reports') or [])}`")
    lines.append(f"- Thresholds: `{report.get('thresholds')}`")
    lines.append(f"- Disabled observers: `{len(report.get('disabled') or [])}`")
    lines.append(f"- Keep observers: `{len(report.get('keep') or [])}`")
    lines.append("")
    lines.append("## Disable Candidates")
    lines.append("")
    lines.append("| Observer | Windows | Rows | Schema Statement Avg | Telemetry Avg | Merge Eligible |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for row in report.get("disabled") or []:
        lines.append(
            f"| `{row.get('observer','')}` | {int(row.get('windows',0))} | {int(row.get('rows_total',0))} | "
            f"{float(row.get('schema_statement_avg',0.0)):.2%} | {float(row.get('telemetry_avg',0.0)):.2%} | "
            f"{int(row.get('merge_eligible_total',0))} |"
        )
    lines.append("")
    lines.append("## Keep Candidates")
    lines.append("")
    lines.append("| Observer | Windows | Rows | Schema Statement Avg | Telemetry Avg | Merge Eligible |")
    lines.append("|---|---:|---:|---:|---:|---:|")
    for row in report.get("keep") or []:
        lines.append(
            f"| `{row.get('observer','')}` | {int(row.get('windows',0))} | {int(row.get('rows_total',0))} | "
            f"{float(row.get('schema_statement_avg',0.0)):.2%} | {float(row.get('telemetry_avg',0.0)):.2%} | "
            f"{int(row.get('merge_eligible_total',0))} |"
        )
    lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Derive chip observer keep/disable policy from recent diagnostics")
    ap.add_argument(
        "--report-glob",
        default="benchmarks/out/chip_learning_diagnostics_active_observer_v*_report.json",
        help="Glob for diagnostics report files (relative to repo root)",
    )
    ap.add_argument("--windows", type=int, default=3, help="Number of latest windows to analyze")
    ap.add_argument("--min-windows", type=int, default=2, help="Minimum windows seen before disable evaluation")
    ap.add_argument("--min-rows-total", type=int, default=50, help="Minimum total rows before disable evaluation")
    ap.add_argument("--disable-max-schema-statement-rate", type=float, default=0.02, help="Disable if schema_statement_avg <= this")
    ap.add_argument("--disable-min-telemetry-rate", type=float, default=0.8, help="Disable if telemetry_avg >= this")
    ap.add_argument("--keep-min-schema-statement-rate", type=float, default=0.15, help="Keep if schema_statement_avg >= this")
    ap.add_argument("--keep-min-merge-eligible", type=int, default=1, help="Keep if merge_eligible_total >= this")
    ap.add_argument("--out-prefix", default="chip_observer_policy_v1", help="Output prefix under benchmarks/out")
    ap.add_argument("--policy-file", default=str(DEFAULT_POLICY_FILE), help="Policy output path when --apply")
    ap.add_argument("--apply", action="store_true", help="Write derived policy to policy-file")
    args = ap.parse_args()

    loaded = _load_reports(args.report_glob, windows=max(1, int(args.windows)))
    if not loaded:
        raise SystemExit(f"No reports found for glob: {args.report_glob}")

    observed = _summarize(loaded)
    thresholds = {
        "min_windows": int(args.min_windows),
        "min_rows_total": int(args.min_rows_total),
        "disable_max_schema_statement_rate": float(args.disable_max_schema_statement_rate),
        "disable_min_telemetry_rate": float(args.disable_min_telemetry_rate),
        "keep_min_schema_statement_rate": float(args.keep_min_schema_statement_rate),
        "keep_min_merge_eligible": int(args.keep_min_merge_eligible),
    }
    decisions = _evaluate(
        observed,
        min_windows=int(args.min_windows),
        min_rows_total=int(args.min_rows_total),
        disable_max_schema_statement_rate=float(args.disable_max_schema_statement_rate),
        disable_min_telemetry_rate=float(args.disable_min_telemetry_rate),
        keep_min_schema_statement_rate=float(args.keep_min_schema_statement_rate),
        keep_min_merge_eligible=int(args.keep_min_merge_eligible),
    )

    policy = _policy_payload(
        report_paths=[fp.name for fp, _ in loaded],
        disabled_rows=list(decisions.get("disabled") or []),
        keep_rows=list(decisions.get("keep") or []),
        windows=int(args.windows),
        thresholds=thresholds,
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_reports": [fp.name for fp, _ in loaded],
        "windows_analyzed": int(args.windows),
        "thresholds": thresholds,
        "disabled": decisions.get("disabled") or [],
        "keep": decisions.get("keep") or [],
        "neutral": decisions.get("neutral") or [],
        "policy_preview": policy,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    json_path = OUT_DIR / f"{args.out_prefix}_report.json"
    md_path = OUT_DIR / f"{args.out_prefix}_report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(_report_markdown(report), encoding="utf-8")

    if bool(args.apply):
        policy_file = Path(args.policy_file)
        policy_file.parent.mkdir(parents=True, exist_ok=True)
        policy_file.write_text(json.dumps(policy, indent=2), encoding="utf-8")
        print(f"Applied policy: {policy_file}")

    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    print(
        "Policy: "
        f"disable={len(report.get('disabled') or [])} "
        f"keep={len(report.get('keep') or [])} "
        f"neutral={len(report.get('neutral') or [])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

