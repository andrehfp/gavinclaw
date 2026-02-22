#!/usr/bin/env python3
"""Run advisory realism benchmark across per-domain slices.

This extends realism evaluation from one mixed case file into many
domain-specific benches in a single command.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

ROOT = Path(__file__).resolve().parents[1]
BENCH_DIR = ROOT / "benchmarks"
if str(BENCH_DIR) not in sys.path:
    sys.path.insert(0, str(BENCH_DIR))

import advisory_quality_ab as aq
import advisory_realism_bench as arb


DEFAULT_CASES = BENCH_DIR / "data" / "advisory_realism_eval_multidomain_v1.json"


@dataclass
class DomainRun:
    domain: str
    case_count: int
    winner_profile: str
    objective: float
    score: float
    high_value_rate: float
    harmful_emit_rate: float
    unsolicited_emit_rate: float
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


def _norm_domain(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return "general"
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text or "general"


def _slug(value: str) -> str:
    text = _norm_domain(value)
    return text[:60] or "general"


def _load_cases(path: Path) -> Dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, dict):
        rows = raw.get("cases") or []
        return {
            "version": str(raw.get("version") or "advisory-realism-domains"),
            "notes": str(raw.get("notes") or ""),
            "cases": [r for r in rows if isinstance(r, dict)],
        }
    if isinstance(raw, list):
        return {"version": "advisory-realism-domains", "notes": "", "cases": [r for r in raw if isinstance(r, dict)]}
    raise ValueError(f"invalid cases payload: {path}")


def _group_cases(rows: Iterable[Dict[str, Any]], *, min_cases: int, allow_domains: set[str] | None) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        domain = _norm_domain(row.get("domain"))
        if allow_domains is not None and domain not in allow_domains:
            continue
        grouped.setdefault(domain, []).append(row)
    return {k: v for k, v in grouped.items() if len(v) >= max(1, int(min_cases))}


def _merge_profiles(profile_file: str) -> Dict[str, Dict[str, Any]]:
    profiles = dict(aq.DEFAULT_PROFILE_PRESETS)
    if not profile_file:
        return profiles
    pf = Path(profile_file)
    loaded = json.loads(pf.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        return profiles
    for key, val in loaded.items():
        if not isinstance(val, dict):
            continue
        cur = dict(profiles.get(key) or {})
        for section in ("advisory_engine", "advisory_gate", "advisor"):
            if isinstance(val.get(section), dict):
                merged = dict(cur.get(section) or {})
                merged.update(val.get(section) or {})
                cur[section] = merged
        profiles[key] = cur
    return profiles


def _summarize(report: Dict[str, Any], *, domain: str, case_count: int) -> DomainRun:
    winner = report.get("winner") or {}
    summary = winner.get("summary") or {}
    realism = winner.get("realism") or {}
    gate_rows = winner.get("gates") or {}
    gates: Dict[str, bool] = {}
    for key, row in dict(gate_rows).items():
        gates[str(key)] = bool((row or {}).get("ok"))
    all_pass = bool(gates) and all(gates.values())
    return DomainRun(
        domain=domain,
        case_count=int(case_count),
        winner_profile=str(winner.get("profile") or "n/a"),
        objective=_safe_float(winner.get("objective"), 0.0),
        score=_safe_float(summary.get("score"), 0.0),
        high_value_rate=_safe_float(realism.get("high_value_rate"), 0.0),
        harmful_emit_rate=_safe_float(realism.get("harmful_emit_rate"), 1.0),
        unsolicited_emit_rate=_safe_float(realism.get("unsolicited_emit_rate"), 0.0),
        critical_miss_rate=_safe_float(realism.get("critical_miss_rate"), 1.0),
        source_alignment_rate=_safe_float(realism.get("source_alignment_rate"), 0.0),
        theory_discrimination_rate=_safe_float(realism.get("theory_discrimination_rate"), 0.0),
        trace_bound_rate=_safe_float(realism.get("trace_bound_rate"), 0.0),
        all_gates_pass=all_pass,
        gates=gates,
    )


def _weighted_avg(runs: List[DomainRun], attr: str) -> float:
    numer = 0.0
    denom = 0
    for row in runs:
        weight = max(1, int(row.case_count))
        numer += float(getattr(row, attr)) * weight
        denom += weight
    if denom <= 0:
        return 0.0
    return round(numer / denom, 4)


def _report_markdown(report: Dict[str, Any]) -> str:
    lines: List[str] = []
    lines.append(f"# Advisory Realism Domain Matrix ({report.get('generated_at', '')})")
    lines.append("")
    lines.append(f"- Cases file: `{report.get('cases_path', '')}`")
    lines.append(f"- Domains run: `{report.get('domain_count', 0)}`")
    lines.append(f"- Total cases: `{report.get('total_cases', 0)}`")
    lines.append(f"- Profiles: `{', '.join(report.get('profiles') or [])}`")
    lines.append(f"- Force live path: `{bool(report.get('force_live', True))}`")
    lines.append("")
    lines.append("## Domain Winners")
    lines.append("")
    lines.append("| Domain | Cases | Winner | Objective | High-Value | Harmful | Unsolicited | Source Align | Theory Disc | Gates |")
    lines.append("|---|---:|---|---:|---:|---:|---:|---:|---:|---|")
    for row in report.get("domains") or []:
        gate_state = "PASS" if bool(row.get("all_gates_pass")) else "FAIL"
        lines.append(
            f"| `{row.get('domain','')}` | {int(row.get('case_count',0))} | `{row.get('winner_profile','')}` | "
            f"{float(row.get('objective',0.0)):.4f} | {float(row.get('high_value_rate',0.0)):.2%} | "
            f"{float(row.get('harmful_emit_rate',0.0)):.2%} | {float(row.get('unsolicited_emit_rate',0.0)):.2%} | {float(row.get('source_alignment_rate',0.0)):.2%} | "
            f"{float(row.get('theory_discrimination_rate',0.0)):.2%} | {gate_state} |"
        )
    lines.append("")
    weighted = report.get("weighted") or {}
    lines.append("## Weighted Summary")
    lines.append("")
    lines.append(f"- Objective: `{float(weighted.get('objective', 0.0)):.4f}`")
    lines.append(f"- Base score: `{float(weighted.get('score', 0.0)):.4f}`")
    lines.append(f"- High-value: `{float(weighted.get('high_value_rate', 0.0)):.2%}`")
    lines.append(f"- Harmful emit: `{float(weighted.get('harmful_emit_rate', 0.0)):.2%}`")
    lines.append(f"- Unsolicited emit: `{float(weighted.get('unsolicited_emit_rate', 0.0)):.2%}`")
    lines.append(f"- Critical miss: `{float(weighted.get('critical_miss_rate', 0.0)):.2%}`")
    lines.append(f"- Source alignment: `{float(weighted.get('source_alignment_rate', 0.0)):.2%}`")
    lines.append(f"- Theory discrimination: `{float(weighted.get('theory_discrimination_rate', 0.0)):.2%}`")
    lines.append(f"- Trace bound: `{float(weighted.get('trace_bound_rate', 0.0)):.2%}`")
    lines.append("")
    lines.append("## Gap Order")
    lines.append("")
    for idx, item in enumerate(report.get("gap_order") or [], start=1):
        lines.append(
            f"{idx}. `{item.get('domain','')}` "
            f"(objective={float(item.get('objective',0.0)):.4f}, "
            f"high_value={float(item.get('high_value_rate',0.0)):.2%}, "
            f"harmful={float(item.get('harmful_emit_rate',0.0)):.2%})"
        )
    lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Run advisory realism benchmarks per domain")
    ap.add_argument("--cases", default=str(DEFAULT_CASES), help="Path to multidomain cases JSON")
    ap.add_argument("--profiles", default="baseline,balanced,strict", help="Comma-separated profile names")
    ap.add_argument("--profile-file", default="", help="Optional profile overlay JSON")
    ap.add_argument("--repeats", type=int, default=1, help="Repeats per case")
    ap.add_argument("--force-live", action=argparse.BooleanOptionalAction, default=True, help="Force live retrieval path")
    ap.add_argument("--min-cases-per-domain", type=int, default=2, help="Only run domains with at least this many cases")
    ap.add_argument("--domains", default="", help="Optional comma-separated domain allow-list")
    ap.add_argument("--dry-run", action="store_true", help="Only print planned domain slices")
    ap.add_argument(
        "--save-domain-reports",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Write per-domain realism reports under benchmarks/out/<prefix>_domains",
    )
    ap.add_argument("--out-prefix", default="advisory_realism_domain_matrix", help="Output file prefix in benchmarks/out")
    args = ap.parse_args()

    payload = _load_cases(Path(args.cases))
    rows = list(payload.get("cases") or [])
    allow_domains = None
    if str(args.domains or "").strip():
        allow_domains = {_norm_domain(x) for x in str(args.domains).split(",") if str(x).strip()}
    grouped = _group_cases(rows, min_cases=int(args.min_cases_per_domain), allow_domains=allow_domains)
    if not grouped:
        print("No domains match selection/min-cases criteria", file=sys.stderr)
        return 2

    print("Advisory Realism Domain Matrix")
    print(f"- cases: {args.cases}")
    for domain in sorted(grouped):
        print(f"  - {domain}: {len(grouped[domain])} cases")
    if bool(args.dry_run):
        return 0

    profiles = _merge_profiles(str(args.profile_file or ""))
    profile_names = [x.strip() for x in str(args.profiles or "").split(",") if x.strip()]
    runs: List[DomainRun] = []
    out_dir = ROOT / "benchmarks" / "out"
    out_dir.mkdir(parents=True, exist_ok=True)
    domain_out_dir = out_dir / f"{args.out_prefix}_domains"
    if bool(args.save_domain_reports):
        domain_out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="advisory_realism_domains_", dir=str(ROOT)) as tmp:
        tmp_dir = Path(tmp)
        for domain in sorted(grouped):
            subset_path = tmp_dir / f"{_slug(domain)}.json"
            subset_payload = {
                "version": str(payload.get("version") or "advisory-realism-domains"),
                "notes": f"domain-slice:{domain}",
                "cases": grouped[domain],
            }
            subset_path.write_text(json.dumps(subset_payload, indent=2), encoding="utf-8")
            report = arb.run_realism_benchmark(
                cases_path=subset_path,
                profiles=profiles,
                profile_names=profile_names,
                repeats=max(1, int(args.repeats)),
                force_live=bool(args.force_live),
                gates=arb.REALISM_GATES,
            )
            if bool(args.save_domain_reports):
                dom_slug = _slug(domain)
                dom_json = domain_out_dir / f"{dom_slug}_report.json"
                dom_md = domain_out_dir / f"{dom_slug}_report.md"
                dom_json.write_text(json.dumps(report, indent=2), encoding="utf-8")
                dom_md.write_text(arb._report_markdown(report), encoding="utf-8")
            runs.append(_summarize(report, domain=domain, case_count=len(grouped[domain])))

    runs_sorted = sorted(runs, key=lambda r: (float(r.objective), float(r.high_value_rate), -float(r.harmful_emit_rate)))
    weighted = {
        "objective": _weighted_avg(runs, "objective"),
        "score": _weighted_avg(runs, "score"),
        "high_value_rate": _weighted_avg(runs, "high_value_rate"),
        "harmful_emit_rate": _weighted_avg(runs, "harmful_emit_rate"),
        "unsolicited_emit_rate": _weighted_avg(runs, "unsolicited_emit_rate"),
        "critical_miss_rate": _weighted_avg(runs, "critical_miss_rate"),
        "source_alignment_rate": _weighted_avg(runs, "source_alignment_rate"),
        "theory_discrimination_rate": _weighted_avg(runs, "theory_discrimination_rate"),
        "trace_bound_rate": _weighted_avg(runs, "trace_bound_rate"),
    }

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cases_path": str(Path(args.cases)),
        "profiles": profile_names,
        "repeats": int(args.repeats),
        "force_live": bool(args.force_live),
        "domain_count": len(runs),
        "total_cases": int(sum(max(1, int(r.case_count)) for r in runs)),
        "domains": [r.__dict__ for r in sorted(runs, key=lambda x: x.domain)],
        "weighted": weighted,
        "gap_order": [r.__dict__ for r in runs_sorted],
    }

    json_path = out_dir / f"{args.out_prefix}_report.json"
    md_path = out_dir / f"{args.out_prefix}_report.md"
    json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    md_path.write_text(_report_markdown(report), encoding="utf-8")

    print(f"Wrote: {json_path}")
    print(f"Wrote: {md_path}")
    print(
        "Weighted:"
        f" objective={weighted['objective']:.4f}"
        f" high_value={weighted['high_value_rate']:.2%}"
        f" harmful={weighted['harmful_emit_rate']:.2%}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

