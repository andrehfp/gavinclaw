from __future__ import annotations

import argparse
import json
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class Tick:
    ts: float
    captured_prompts: int
    captured_edits: int
    opportunities_found: int
    persisted: int
    llm_attempted: bool
    llm_used: bool
    llm_provider: Optional[str]
    llm_error: Optional[str]
    llm_candidates: int
    llm_selected: int
    llm_skipped_reason: Optional[str]


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    # Heartbeat is written via overwrite; on Windows we can occasionally read a partial file.
    for _ in range(3):
        try:
            return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            time.sleep(0.05)
    return None


def _append_queue_events(*, prompt_text: str, edit_text: str = "") -> Tuple[str, str]:
    q = Path.home() / ".spark" / "queue" / "events.jsonl"
    sid = f"oppscan-soak-{int(time.time())}"
    tid = uuid.uuid4().hex[:16]
    now = time.time()
    cwd = str(Path.cwd())

    user = {
        "event_type": "user_prompt",
        "session_id": sid,
        "timestamp": now,
        "data": {
            "hook_event": "UserPrompt",
            "cwd": cwd,
            "trace_id": tid,
            "source": "opportunity_scanner_soak",
            "payload": {"role": "user", "text": prompt_text},
        },
        "tool_name": None,
        "tool_input": None,
        "error": None,
    }
    rows = [user]
    if edit_text.strip():
        rows.append(
            {
                "event_type": "post_tool",
                "session_id": sid,
                "timestamp": now + 0.01,
                "data": {
                    "hook_event": "PostToolUse",
                    "cwd": cwd,
                    "trace_id": tid,
                    "source": "opportunity_scanner_soak",
                    "payload": {},
                },
                "tool_name": "Edit",
                "tool_input": {"content": edit_text},
                "error": None,
            }
        )

    q.parent.mkdir(parents=True, exist_ok=True)
    with q.open("a", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")
    return sid, tid


def _tick_from_hb(hb: Dict[str, Any]) -> Optional[Tick]:
    ts = hb.get("ts")
    try:
        tsf = float(ts)
    except Exception:
        return None
    stats = hb.get("stats") or {}
    sc = stats.get("opportunity_scanner") or {}
    llm = sc.get("llm") or {}

    def _i(x: Any) -> int:
        try:
            return int(x or 0)
        except Exception:
            return 0

    return Tick(
        ts=tsf,
        captured_prompts=_i(sc.get("captured_prompts")),
        captured_edits=_i(sc.get("captured_edits")),
        opportunities_found=_i(sc.get("opportunities_found")),
        persisted=_i(sc.get("persisted")),
        llm_attempted=bool(llm.get("attempted")),
        llm_used=bool(llm.get("used")),
        llm_provider=(str(llm.get("provider") or "").strip() or None),
        llm_error=(str(llm.get("error") or "").strip() or None),
        llm_candidates=_i(llm.get("candidates")),
        llm_selected=_i(llm.get("selected")),
        llm_skipped_reason=(str(llm.get("skipped_reason") or "").strip() or None),
    )


def _load_new_self_rows(since_ts: float) -> List[Dict[str, Any]]:
    p = Path.home() / ".spark" / "opportunity_scanner" / "self_opportunities.jsonl"
    if not p.exists():
        return []
    out: List[Dict[str, Any]] = []
    for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
        try:
            row = json.loads(line)
        except Exception:
            continue
        try:
            ts = float(row.get("ts") or 0.0)
        except Exception:
            ts = 0.0
        if ts >= since_ts:
            out.append(row)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--duration-s", type=int, default=600)
    ap.add_argument("--poll-s", type=float, default=2.0)
    ap.add_argument("--inject-every-s", type=int, default=180)
    ap.add_argument("--inject-count", type=int, default=3)
    args = ap.parse_args()

    hb_path = Path.home() / ".spark" / "bridge_worker_heartbeat.json"
    start_ts = time.time()
    end_ts = start_ts + max(10, int(args.duration_s))

    injections = 0
    next_inject = start_ts + 2.0
    last_hb_ts: float = 0.0
    ticks: List[Tick] = []

    while time.time() < end_ts:
        now = time.time()
        if injections < int(args.inject_count) and now >= next_inject:
            injections += 1
            next_inject = now + max(10, int(args.inject_every_s))
            prompt_variants = [
                "Tune novelty: avoid repeating evergreen prompts when context is thin.",
                "Tune evidence: add measurable proof checks before persisting an opportunity.",
                "Tune reversibility: add rollback criteria for any new autonomous behavior.",
                "Tune safety: ensure humanity guardrails are explicit and non-telemetry.",
                "Tune SLO: ensure >= 1 novel Minimax opportunity per 10 contextful cycles.",
                "Tune reliability: minimize minimax empty/timeout by bounding context and retrying.",
            ]
            variant = prompt_variants[(injections - 1) % len(prompt_variants)]
            _append_queue_events(
                prompt_text=(
                    f"Opportunity Scanner soak ({injections}): {variant} "
                    "Generate 2 novel self-improvement opportunities. Include measurable proof and rollback criteria. Avoid telemetry."
                ),
                edit_text="# soak: update scanner quality gate and SLO instrumentation\n",
            )

        hb = _read_json(hb_path)
        if hb:
            t = _tick_from_hb(hb)
            if t and t.ts > last_hb_ts:
                last_hb_ts = t.ts
                ticks.append(t)

        time.sleep(max(0.2, float(args.poll_s)))

    # Summarize
    contextful = [t for t in ticks if (t.captured_prompts + t.captured_edits) > 0]
    llm_attempted = [t for t in contextful if t.llm_attempted]
    llm_used = [t for t in contextful if t.llm_used]
    llm_selected_total = sum(t.llm_selected for t in contextful)
    llm_errors: Dict[str, int] = {}
    for t in llm_attempted:
        if t.llm_error:
            llm_errors[t.llm_error] = llm_errors.get(t.llm_error, 0) + 1

    new_rows = _load_new_self_rows(since_ts=start_ts)
    src_counts: Dict[str, int] = {}
    for r in new_rows:
        s = str(r.get("source") or "unknown").strip().lower()
        src_counts[s] = src_counts.get(s, 0) + 1

    # Keep output ASCII-safe.
    summary = {
        "window": {"start_ts": start_ts, "end_ts": end_ts, "duration_s": int(end_ts - start_ts)},
        "ticks": len(ticks),
        "contextful_ticks": len(contextful),
        "llm_attempted_contextful": len(llm_attempted),
        "llm_used_contextful": len(llm_used),
        "llm_selected_total": llm_selected_total,
        "llm_errors": llm_errors,
        "new_self_rows": len(new_rows),
        "new_self_rows_by_source": src_counts,
        "providers_used": {
            p: sum(1 for t in llm_used if (t.llm_provider or "") == p)
            for p in sorted({t.llm_provider for t in llm_used if t.llm_provider})
        },
    }

    out_dir = Path("docs") / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{time.strftime('%Y-%m-%d')}_opportunity_scanner_soak_summary_{int(start_ts)}.json"
    out_path.write_text(json.dumps(summary, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
