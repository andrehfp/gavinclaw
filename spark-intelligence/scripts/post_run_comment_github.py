#!/usr/bin/env python3
"""Post benchmark summary comments to a GitHub PR or issue via gh CLI.

Usage examples:
  python scripts/post_run_comment_github.py --pr 123 --title "Canary Update" --report-json benchmarks/out/foo.json
  python scripts/post_run_comment_github.py --issue 45 --title "Daily Loop" --report-json benchmarks/out/bar.json --report-json benchmarks/out/baz.json
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def _run(cmd: List[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True)


def _check_gh_available() -> None:
    proc = _run(["gh", "--version"])
    if proc.returncode != 0:
        raise SystemExit("`gh` CLI is not available on PATH.")


def _derive_repo_slug() -> str:
    proc = _run(["git", "remote", "get-url", "origin"])
    if proc.returncode != 0:
        raise SystemExit("Failed to read git origin remote.")
    url = (proc.stdout or "").strip()
    if not url:
        raise SystemExit("Origin remote URL is empty.")
    url = url.rstrip(".git")
    if url.startswith("git@github.com:"):
        return url.split("git@github.com:")[1]
    if "github.com/" in url:
        return url.split("github.com/")[1]
    raise SystemExit(f"Unsupported remote URL format: {url}")


def _load_json(path: Path) -> Dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as ex:
        return {"_error": f"failed to parse {path}: {ex}"}


def _extract_highlights(data: Dict[str, Any]) -> List[str]:
    lines: List[str] = []
    if "winner" in data and isinstance(data.get("winner"), dict):
        w = data["winner"]
        lines.append(f"- winner: `{w.get('profile', w.get('system', 'n/a'))}`")
        summary = w.get("summary") or {}
        if "score" in summary:
            lines.append(f"- score: `{summary.get('score')}`")
        if "objective_score" in summary:
            lines.append(f"- objective_score: `{summary.get('objective_score')}`")

    if "ranked_profiles" in data and isinstance(data.get("ranked_profiles"), list) and data["ranked_profiles"]:
        top = data["ranked_profiles"][0]
        lines.append(f"- top profile: `{top.get('profile', 'n/a')}`")
        if "objective" in top:
            lines.append(f"- objective: `{top.get('objective')}`")
        realism = top.get("realism") or {}
        if "high_value_rate" in realism:
            lines.append(f"- high_value_rate: `{realism.get('high_value_rate')}`")
        if "harmful_emit_rate" in realism:
            lines.append(f"- harmful_emit_rate: `{realism.get('harmful_emit_rate')}`")

    if "weighted" in data and isinstance(data.get("weighted"), dict):
        w = data["weighted"]
        if "objective" in w:
            lines.append(f"- weighted objective: `{w.get('objective')}`")
        if "high_value_rate" in w:
            lines.append(f"- weighted high_value_rate: `{w.get('high_value_rate')}`")
        if "harmful_emit_rate" in w:
            lines.append(f"- weighted harmful_emit_rate: `{w.get('harmful_emit_rate')}`")

    if "summaries" in data and isinstance(data.get("summaries"), list):
        winner = data.get("winner")
        lines.append(f"- retrieval winner: `{winner}`")
        for s in data["summaries"]:
            system = s.get("system")
            if not system:
                continue
            lines.append(
                f"- {system}: mrr=`{s.get('mrr')}`, top1=`{s.get('top1_hit_rate')}`, "
                f"non_empty=`{s.get('non_empty_rate')}`, p95=`{s.get('latency_ms_p95')}`"
            )
    return lines


def build_comment(title: str, report_paths: List[Path]) -> str:
    lines: List[str] = [f"## {title}", ""]
    for report in report_paths:
        lines.append(f"### `{report.as_posix()}`")
        if not report.exists():
            lines.append("- status: missing")
            lines.append("")
            continue
        data = _load_json(report)
        if "_error" in data:
            lines.append(f"- status: {data['_error']}")
            lines.append("")
            continue
        highlights = _extract_highlights(data)
        if highlights:
            lines.extend(highlights)
        else:
            lines.append("- status: parsed, no standard highlight keys found")
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def post_comment(repo: str, number: int, body: str) -> str:
    # PR comments also use issues/{number}/comments in GitHub API.
    endpoint = f"/repos/{repo}/issues/{number}/comments"
    proc = _run(["gh", "api", endpoint, "--method", "POST", "-f", f"body={body}"])
    if proc.returncode != 0:
        raise SystemExit(f"Failed to post comment:\n{proc.stderr}")
    try:
        payload = json.loads(proc.stdout or "{}")
        return str(payload.get("html_url") or payload.get("url") or "")
    except Exception:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser(description="Post benchmark summary comment to GitHub PR/issue.")
    target = ap.add_mutually_exclusive_group(required=True)
    target.add_argument("--pr", type=int, help="Pull request number")
    target.add_argument("--issue", type=int, help="Issue number")
    ap.add_argument("--repo", default="", help="owner/repo slug (default: derive from git origin)")
    ap.add_argument("--title", default="Spark Benchmark Update", help="Comment title")
    ap.add_argument("--report-json", action="append", default=[], help="JSON report path (repeatable)")
    ap.add_argument("--body-file", default="", help="Optional markdown body file (uses this if provided)")
    args = ap.parse_args()

    _check_gh_available()
    repo = args.repo.strip() or _derive_repo_slug()
    number = int(args.pr or args.issue)

    if args.body_file:
        body_path = Path(args.body_file)
        if not body_path.exists():
            raise SystemExit(f"Body file not found: {body_path}")
        body = body_path.read_text(encoding="utf-8")
    else:
        reports = [Path(p) for p in args.report_json]
        if not reports:
            raise SystemExit("Provide at least one --report-json or use --body-file.")
        body = build_comment(args.title, reports)

    url = post_comment(repo, number, body)
    print(f"Posted comment to {repo} #{number}")
    if url:
        print(f"URL: {url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

