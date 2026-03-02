#!/usr/bin/env python3
"""
Gavin Context Ops (AFS-lite for assistant runtime)

Stores per-turn manifest/eval/event artifacts in JSONL files under:
  memory/gavin-context/

Usage examples:
  python3 scripts/gavin_context.py manifest \
    --objective "Implement context logging" \
    --task-type execution \
    --source "workspace:scripts+memory updates:1200" \
    --source "user-request:direct implementation:300"

  python3 scripts/gavin_context.py event \
    --turn-id <id> --phase implementation --note "created script"

  python3 scripts/gavin_context.py eval \
    --turn-id <id> --status ok --confidence 0.88 \
    --outcome "Implemented manifest/eval/replay"

  python3 scripts/gavin_context.py replay --turn-id <id>
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

try:
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "memory" / "gavin-context"
MANIFESTS = BASE / "manifests.jsonl"
EVALS = BASE / "evals.jsonl"
EVENTS = BASE / "events.jsonl"
POLICY = BASE / "policy.json"

DEFAULT_POLICY = {
    "version": 1,
    "budgetByTaskType": {
        "heartbeat": 1200,
        "ops": 2000,
        "analysis": 4000,
        "execution": 5000,
        "strategy": 6500,
    },
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_base() -> None:
    BASE.mkdir(parents=True, exist_ok=True)
    if not POLICY.exists():
        POLICY.write_text(json.dumps(DEFAULT_POLICY, ensure_ascii=False, indent=2) + "\n")


def load_policy() -> Dict[str, Any]:
    ensure_base()
    try:
        return json.loads(POLICY.read_text())
    except Exception:
        return DEFAULT_POLICY


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    out: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out


def parse_source(item: str) -> Dict[str, Any]:
    # format: source:reason:tokens (tokens optional)
    parts = item.split(":")
    if len(parts) == 1:
        return {"source": parts[0], "reason": None, "tokens": None}
    if len(parts) == 2:
        return {"source": parts[0], "reason": parts[1], "tokens": None}
    source = parts[0]
    reason = ":".join(parts[1:-1])
    tokens_raw = parts[-1]
    try:
        tokens = int(tokens_raw)
    except ValueError:
        reason = ":".join(parts[1:])
        tokens = None
    return {"source": source, "reason": reason, "tokens": tokens}


def cmd_manifest(args: argparse.Namespace) -> int:
    policy = load_policy()
    budget = args.budget
    if budget is None:
        budget = (
            policy.get("budgetByTaskType", {}).get(args.task_type)
            or policy.get("budgetByTaskType", {}).get("analysis")
            or 4000
        )

    turn_id = str(uuid.uuid4())
    selected = [parse_source(s) for s in (args.source or [])]
    excluded = [parse_source(s) for s in (args.exclude or [])]

    payload = {
        "turn_id": turn_id,
        "created_at": now_iso(),
        "objective": args.objective,
        "task_type": args.task_type,
        "budget_tokens": int(budget),
        "selected": selected,
        "excluded": excluded,
        "constraints": args.constraint or [],
        "notes": args.note,
        "status": "started",
    }
    append_jsonl(MANIFESTS, payload)
    print(turn_id)
    return 0


def cmd_event(args: argparse.Namespace) -> int:
    ensure_base()
    payload = {
        "turn_id": args.turn_id,
        "created_at": now_iso(),
        "phase": args.phase,
        "note": args.note,
        "data": json.loads(args.data) if args.data else None,
    }
    append_jsonl(EVENTS, payload)
    print("ok")
    return 0


def cmd_eval(args: argparse.Namespace) -> int:
    ensure_base()
    payload = {
        "turn_id": args.turn_id,
        "created_at": now_iso(),
        "status": args.status,
        "confidence": args.confidence,
        "outcome": args.outcome,
        "risks": args.risk or [],
        "next_steps": args.next_step or [],
        "expected_signals": args.expected_signal or [],
        "actual_signals": args.actual_signal or [],
    }
    append_jsonl(EVALS, payload)
    print("ok")
    return 0


def cmd_replay(args: argparse.Namespace) -> int:
    manifests = [x for x in read_jsonl(MANIFESTS) if x.get("turn_id") == args.turn_id]
    events = [x for x in read_jsonl(EVENTS) if x.get("turn_id") == args.turn_id]
    evals = [x for x in read_jsonl(EVALS) if x.get("turn_id") == args.turn_id]

    if not manifests and not events and not evals:
        print(json.dumps({"error": "turn_id not found", "turn_id": args.turn_id}, indent=2))
        return 1

    out = {
        "turn_id": args.turn_id,
        "manifest": manifests[-1] if manifests else None,
        "events": events,
        "eval": evals[-1] if evals else None,
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def resolve_tz(name: str):
    if ZoneInfo is None:
        return timezone.utc
    try:
        return ZoneInfo(name)
    except Exception:
        return timezone.utc


def same_local_date(ts: str, target_date: str, tz_name: str) -> bool:
    try:
        dt = parse_iso(ts).astimezone(resolve_tz(tz_name))
        return dt.date().isoformat() == target_date
    except Exception:
        return False


def cmd_report(args: argparse.Namespace) -> int:
    ensure_base()
    tz_name = args.tz or "America/Sao_Paulo"
    tz = resolve_tz(tz_name)
    report_date = args.date or datetime.now(tz).date().isoformat()

    manifests = [
        x
        for x in read_jsonl(MANIFESTS)
        if same_local_date(str(x.get("created_at", "")), report_date, tz_name)
    ]
    events = [
        x
        for x in read_jsonl(EVENTS)
        if same_local_date(str(x.get("created_at", "")), report_date, tz_name)
    ]
    evals = [
        x
        for x in read_jsonl(EVALS)
        if same_local_date(str(x.get("created_at", "")), report_date, tz_name)
    ]

    eval_by_turn = {x.get("turn_id"): x for x in evals if x.get("turn_id")}

    task_counts = Counter([str(m.get("task_type", "unknown")) for m in manifests])
    phase_counts = Counter([str(e.get("phase", "unknown")) for e in events])

    status_counts = Counter()
    confidences: List[float] = []
    for m in manifests:
        turn_id = m.get("turn_id")
        ev = eval_by_turn.get(turn_id)
        if ev:
            status = str(ev.get("status", "unknown"))
            status_counts[status] += 1
            conf = ev.get("confidence")
            if isinstance(conf, (int, float)):
                confidences.append(float(conf))
        else:
            status_counts["no_eval"] += 1

    avg_conf = round(sum(confidences) / len(confidences), 3) if confidences else None

    risk_counts = Counter()
    for ev in evals:
        for risk in ev.get("risks") or []:
            risk_counts[str(risk)] += 1

    lines = [
        f"# Gavin Context Daily Report ({report_date})",
        "",
        f"Timezone: `{tz_name}`",
        "",
        "## Resumo",
        f"- Turns iniciados: **{len(manifests)}**",
        f"- Events registrados: **{len(events)}**",
        f"- Evals registrados: **{len(evals)}**",
        f"- Confiança média: **{avg_conf if avg_conf is not None else 'N/A'}**",
        "",
        "## Status dos turns",
    ]

    if status_counts:
        for status, count in status_counts.most_common():
            lines.append(f"- {status}: **{count}**")
    else:
        lines.append("- Nenhum")

    lines.extend(["", "## Task types"])
    if task_counts:
        for task, count in task_counts.most_common():
            lines.append(f"- {task}: **{count}**")
    else:
        lines.append("- Nenhum")

    lines.extend(["", "## Fases de evento"])
    if phase_counts:
        for phase, count in phase_counts.most_common():
            lines.append(f"- {phase}: **{count}**")
    else:
        lines.append("- Nenhum")

    lines.extend(["", "## Riscos mais frequentes"])
    if risk_counts:
        for risk, count in risk_counts.most_common(5):
            lines.append(f"- {risk}: **{count}**")
    else:
        lines.append("- Nenhum")

    low_conf = [
        ev
        for ev in evals
        if isinstance(ev.get("confidence"), (int, float)) and float(ev.get("confidence")) < 0.7
    ]
    lines.extend(["", "## Turns com baixa confiança (< 0.7)"])
    if low_conf:
        for ev in low_conf[:10]:
            lines.append(
                f"- `{ev.get('turn_id')}` status={ev.get('status')} conf={ev.get('confidence')}"
            )
    else:
        lines.append("- Nenhum")

    report_md = "\n".join(lines).strip() + "\n"

    if args.out:
        out_path = Path(args.out)
        if not out_path.is_absolute():
            out_path = ROOT / out_path
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report_md, encoding="utf-8")

    print(report_md)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Gavin context manifest/eval logger")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_manifest = sub.add_parser("manifest", help="Create turn manifest")
    p_manifest.add_argument("--objective", required=True)
    p_manifest.add_argument(
        "--task-type",
        default="analysis",
        choices=["heartbeat", "ops", "analysis", "execution", "strategy"],
    )
    p_manifest.add_argument("--budget", type=int)
    p_manifest.add_argument("--source", action="append", help="source:reason:tokens")
    p_manifest.add_argument("--exclude", action="append", help="source:reason:tokens")
    p_manifest.add_argument("--constraint", action="append")
    p_manifest.add_argument("--note")
    p_manifest.set_defaults(func=cmd_manifest)

    p_event = sub.add_parser("event", help="Append turn event")
    p_event.add_argument("--turn-id", required=True)
    p_event.add_argument("--phase", required=True)
    p_event.add_argument("--note", required=True)
    p_event.add_argument("--data", help="JSON object string")
    p_event.set_defaults(func=cmd_event)

    p_eval = sub.add_parser("eval", help="Append turn eval")
    p_eval.add_argument("--turn-id", required=True)
    p_eval.add_argument("--status", required=True, choices=["ok", "partial", "fail"])
    p_eval.add_argument("--confidence", type=float, default=0.8)
    p_eval.add_argument("--outcome", required=True)
    p_eval.add_argument("--risk", action="append")
    p_eval.add_argument("--next-step", action="append")
    p_eval.add_argument("--expected-signal", action="append")
    p_eval.add_argument("--actual-signal", action="append")
    p_eval.set_defaults(func=cmd_eval)

    p_replay = sub.add_parser("replay", help="Show manifest/events/eval for turn")
    p_replay.add_argument("--turn-id", required=True)
    p_replay.set_defaults(func=cmd_replay)

    p_report = sub.add_parser("report", help="Generate daily context report")
    p_report.add_argument("--date", help="Local date YYYY-MM-DD (default: today)")
    p_report.add_argument("--tz", default="America/Sao_Paulo", help="Timezone")
    p_report.add_argument("--out", help="Optional output markdown path")
    p_report.set_defaults(func=cmd_report)

    return p


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
