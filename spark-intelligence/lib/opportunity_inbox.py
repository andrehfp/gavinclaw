"""Opportunity inbox — user-facing opportunity management.

MIGRATION NOTE (2026-02-22): Being migrated to spark-learning-systems
(system 27-opportunity-scanner). Use lib.opportunity_scanner_adapter.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


OPPORTUNITY_DIR = Path.home() / ".spark" / "opportunity_scanner"
SELF_FILE = OPPORTUNITY_DIR / "self_opportunities.jsonl"
DECISIONS_FILE = OPPORTUNITY_DIR / "decisions.jsonl"


@dataclass
class Decision:
    ts: float
    action: str  # accept|dismiss
    opportunity_id: str
    question_key: str
    note: str


def _question_key(question: str) -> str:
    # Keep in sync with lib.opportunity_scanner._question_key, but avoid importing
    # the scanner (it has runtime env side effects).
    import re

    tokens = [t for t in re.findall(r"[a-z0-9]+", str(question or "").lower())]
    if not tokens:
        return ""
    # Drop common stopwords lightly; inbox matching doesn't need perfect parity.
    stop = {"the", "a", "an", "and", "or", "to", "of", "for", "in", "on", "with", "is", "are"}
    toks = [t for t in tokens if t not in stop]
    if not toks:
        toks = tokens
    return " ".join(toks[:14])


def _read_jsonl(path: Path, limit: int = 5000) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    except Exception:
        return []
    if len(lines) > limit:
        lines = lines[-limit:]
    out: List[Dict[str, Any]] = []
    for line in lines:
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except Exception:
            continue
        if isinstance(row, dict):
            out.append(row)
    return out


def load_self_opportunities(
    *,
    limit: int = 20,
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
    project_id: Optional[str] = None,
    operation: Optional[str] = None,
    since_hours: Optional[float] = None,
) -> List[Dict[str, Any]]:
    rows = _read_jsonl(SELF_FILE, limit=8000)
    if since_hours is not None:
        cutoff = time.time() - (float(since_hours) * 3600.0)
        kept = []
        for r in rows:
            try:
                ts = float(r.get("ts") or 0.0)
            except Exception:
                ts = 0.0
            if ts >= cutoff:
                kept.append(r)
        rows = kept

    def _match(r: Dict[str, Any]) -> bool:
        if scope_type and str(r.get("scope_type") or "").strip().lower() != str(scope_type).strip().lower():
            return False
        if scope_id and str(r.get("scope_id") or "").strip().lower() != str(scope_id).strip().lower():
            return False
        if project_id and str(r.get("project_id") or "").strip().lower() != str(project_id).strip().lower():
            return False
        if operation and str(r.get("operation") or "").strip().lower() != str(operation).strip().lower():
            return False
        return True

    rows = [r for r in rows if _match(r)]
    rows.sort(key=lambda r: float(r.get("ts") or 0.0), reverse=True)
    return rows[: max(1, int(limit or 20))]


def load_decisions(limit: int = 2000) -> List[Decision]:
    out: List[Decision] = []
    for row in _read_jsonl(DECISIONS_FILE, limit=limit):
        try:
            ts = float(row.get("ts") or 0.0)
        except Exception:
            ts = 0.0
        out.append(
            Decision(
                ts=ts,
                action=str(row.get("action") or "").strip().lower(),
                opportunity_id=str(row.get("opportunity_id") or "").strip(),
                question_key=str(row.get("question_key") or "").strip(),
                note=str(row.get("note") or "").strip(),
            )
        )
    out.sort(key=lambda d: d.ts, reverse=True)
    return out


def decisions_by_opportunity_id(limit: int = 2000) -> Dict[str, Decision]:
    latest: Dict[str, Decision] = {}
    for d in load_decisions(limit=limit):
        if not d.opportunity_id:
            continue
        if d.opportunity_id not in latest:
            latest[d.opportunity_id] = d
    return latest


def record_decision(
    *,
    action: str,
    opportunity_id: str,
    question: str,
    note: str = "",
    scope_type: Optional[str] = None,
    scope_id: Optional[str] = None,
    project_id: Optional[str] = None,
    operation: Optional[str] = None,
) -> Decision:
    OPPORTUNITY_DIR.mkdir(parents=True, exist_ok=True)
    now = time.time()
    qk = _question_key(question)
    row = {
        "ts": now,
        "action": str(action or "").strip().lower(),
        "opportunity_id": str(opportunity_id or "").strip(),
        "question_key": qk,
        "note": str(note or "").strip(),
        "scope_type": (str(scope_type or "").strip() or None),
        "scope_id": (str(scope_id or "").strip() or None),
        "project_id": (str(project_id or "").strip() or None),
        "operation": (str(operation or "").strip() or None),
    }
    with DECISIONS_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=True) + "\n")
    return Decision(ts=now, action=row["action"], opportunity_id=row["opportunity_id"], question_key=qk, note=row["note"])


def resolve_opportunity(prefix: str, *, search_limit: int = 8000) -> Optional[Dict[str, Any]]:
    pfx = str(prefix or "").strip()
    if not pfx:
        return None
    rows = _read_jsonl(SELF_FILE, limit=search_limit)
    for r in reversed(rows):
        oid = str(r.get("opportunity_id") or "").strip()
        if oid == pfx or oid.endswith(pfx) or oid.startswith(pfx):
            return r
    return None


def render_task_markdown(row: Dict[str, Any]) -> str:
    oid = str(row.get("opportunity_id") or "").strip() or "unknown"
    question = str(row.get("question") or "").strip()
    next_step = str(row.get("next_step") or "").strip()
    rationale = str(row.get("rationale") or "").strip()

    lines: List[str] = []
    lines.append(f"# Opportunity {oid}")
    lines.append("")
    lines.append("## Metadata")
    lines.append(f"- captured_ts: {row.get('ts')}")
    lines.append(f"- scope_type: {row.get('scope_type')}")
    lines.append(f"- scope_id: {row.get('scope_id')}")
    lines.append(f"- project_id: {row.get('project_id')}")
    lines.append(f"- project_label: {row.get('project_label')}")
    lines.append(f"- operation: {row.get('operation')}")
    lines.append(f"- category: {row.get('category')}")
    lines.append(f"- priority: {row.get('priority')}")
    lines.append(f"- confidence: {row.get('confidence')}")
    lines.append(f"- source: {row.get('source')}")
    lines.append(f"- llm_provider: {row.get('llm_provider')}")
    lines.append("")
    lines.append("## Question")
    lines.append(question or "(missing)")
    lines.append("")
    lines.append("## Next Step")
    lines.append(next_step or "(missing)")
    lines.append("")
    lines.append("## Rationale")
    lines.append(rationale or "(missing)")
    lines.append("")
    lines.append("## Execution Plan")
    lines.append("- [ ] Define the smallest change that answers the question.")
    lines.append("- [ ] Add verification (test/command/manual check) before declaring done.")
    lines.append("- [ ] Add a rollback path if behavior regresses.")
    lines.append("")
    lines.append("## Verification")
    lines.append("- [ ] What specific check proves this is improved?")
    lines.append("")
    lines.append("## Rollback")
    lines.append("- [ ] What is the simplest safe revert/fallback?")
    lines.append("")
    return "\n".join(lines)


def write_task_file(
    row: Dict[str, Any],
    *,
    out_dir: Path = Path("docs") / "opportunities" / "accepted",
) -> Path:
    oid = str(row.get("opportunity_id") or "").strip() or "unknown"
    safe_oid = oid.replace(":", "_").replace("/", "_")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{time.strftime('%Y-%m-%d')}_{safe_oid}.md"
    out_path.write_text(render_task_markdown(row) + "\n", encoding="utf-8")
    return out_path

