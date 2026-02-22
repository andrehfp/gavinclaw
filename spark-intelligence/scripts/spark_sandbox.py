#!/usr/bin/env python3
"""
Spark Sandbox Harness

Runs an isolated end-to-end Spark learning loop (capture -> process -> validate ->
predict -> promote -> report) without touching real user data.

Includes chips, outcomes, exposure tracking, project profiling, markdown output,
and an optional baseline regression diff.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass
class SandboxPaths:
    sandbox_root: Path
    sandbox_home: Path
    workspace_dir: Path
    project_dir: Path
    skills_dir: Path
    report_path: Path
    baseline_path: Path
    diff_path: Path


def _set_env(paths: SandboxPaths) -> None:
    # Force all Spark Path.home() calls into the sandbox.
    os.environ["HOME"] = str(paths.sandbox_home)
    os.environ["USERPROFILE"] = str(paths.sandbox_home)
    os.environ["HOMEPATH"] = str(paths.sandbox_home)
    if paths.sandbox_home.drive:
        os.environ["HOMEDRIVE"] = paths.sandbox_home.drive

    os.environ["SPARK_WORKSPACE"] = str(paths.workspace_dir)
    os.environ["SPARK_LOG_DIR"] = str(paths.sandbox_root / "logs")
    os.environ["SPARK_LOG_TEE"] = "0"
    os.environ["SPARK_NO_WATCHDOG"] = "1"
    os.environ["SPARK_EMBEDDINGS"] = "0"
    os.environ["SPARK_SKILLS_DIR"] = str(paths.skills_dir)


def _patch_repo_relative_paths(sandbox_home: Path) -> None:
    # Some modules write to repo-local .spark paths; repoint to sandbox.
    from lib import aha_tracker as _aha
    from lib import spark_voice as _voice
    from lib import growth_tracker as _growth

    sandbox_spark = sandbox_home / ".spark"

    _aha.SPARK_DIR = sandbox_spark
    _aha.AHA_FILE = sandbox_spark / "aha_moments.json"

    _voice.SPARK_DIR = sandbox_spark
    _voice.VOICE_FILE = sandbox_spark / "voice.json"

    _growth.GrowthTracker.GROWTH_FILE = sandbox_spark / "growth.json"


def _ensure_dirs(paths: SandboxPaths, clean: bool) -> None:
    if clean and paths.sandbox_root.exists():
        shutil.rmtree(paths.sandbox_root, ignore_errors=True)
    paths.sandbox_root.mkdir(parents=True, exist_ok=True)
    paths.sandbox_home.mkdir(parents=True, exist_ok=True)
    paths.workspace_dir.mkdir(parents=True, exist_ok=True)
    paths.project_dir.mkdir(parents=True, exist_ok=True)
    paths.skills_dir.mkdir(parents=True, exist_ok=True)


def _seed_project_files(project_dir: Path) -> None:
    for name in ("AGENTS.md", "CLAUDE.md", "SOUL.md", "TOOLS.md", "README.md"):
        p = project_dir / name
        if not p.exists():
            p.write_text(f"# {name}\n\n## Spark Learnings\n\n")


def _seed_skills(skills_dir: Path) -> Path:
    skills_dir.mkdir(parents=True, exist_ok=True)
    sample = skills_dir / "sandbox-skill.yaml"
    if not sample.exists():
        sample.write_text(
            "\n".join(
                [
                    "name: sandbox_skill",
                    "description: Sample skill for sandbox validation",
                    "owns:",
                    "  - scenario design",
                    "delegates:",
                    "  - skill: test_runner",
                    "anti_patterns:",
                    "  - name: skip_validation",
                    "detection:",
                    "  - name: sandbox",
                    "",
                ]
            )
        )
    return sample


def _seed_project_profile(project_dir: Path) -> None:
    import hashlib
    from lib.project_profile import load_profile, save_profile, record_answer, ensure_questions

    profile = load_profile(project_dir)
    profile["phase"] = "prototype"
    ensure_questions(profile)
    record_answer(profile, "gen_goal", "Build a Spark sandbox that exercises the full learning loop.")
    record_answer(profile, "gen_done", "Sandbox runs end-to-end and emits a stable report.")

    def _entry_id(*parts: str) -> str:
        raw = "|".join(p or "" for p in parts).encode("utf-8")
        return hashlib.sha1(raw).hexdigest()[:10]

    def _add_entry(bucket: str, text: str) -> None:
        entry = {
            "entry_id": _entry_id(profile.get("project_key") or "", bucket, text[:160]),
            "text": text,
            "created_at": time.time(),
            "meta": {},
        }
        profile.setdefault(bucket, []).append(entry)

    _add_entry("goals", "Automate regression checks for Spark learning quality.")
    _add_entry("milestones", "Sandbox generates report + baseline diff.")
    _add_entry("references", "Spark sandbox harness format")
    _add_entry("transfers", "Learning loops should be testable with deterministic scenarios.")
    profile["done"] = "End-to-end learning pipeline validated with stable report."
    save_profile(profile)


def _emit_observe_event(payload: Dict[str, Any]) -> None:
    # Run observe hook logic in-process to avoid subprocess and keep sandbox paths.
    import io
    import hooks.observe as observe

    old_stdin = sys.stdin
    old_exit = sys.exit
    try:
        sys.stdin = io.StringIO(json.dumps(payload))
        sys.exit = lambda *_a, **_k: None
        observe.main()
    finally:
        sys.stdin = old_stdin
        sys.exit = old_exit


def _build_scenario(project_dir: Path, session_id: str) -> List[Dict[str, Any]]:
    cwd = str(project_dir)
    py_content = "\n".join(
        [
            "from pathlib import Path",
            "",
            "def parse_value(x):",
            "    if x is None:",
            "        return 0",
            "    return int(x)",
            "",
            "class ConfigLoader:",
            "    def __init__(self, root: Path):",
            "        self.root = root",
            "",
            "    def load_config(self):",
            "        return {}",
        ]
    )

    return [
        {"session_id": session_id, "hook_event_name": "SessionStart", "cwd": cwd},
        {
            "session_id": session_id,
            "hook_event_name": "UserPromptSubmit",
            "cwd": cwd,
            "prompt": "Remember this: always Read before Edit.",
        },
        {
            "session_id": session_id,
            "hook_event_name": "PreToolUse",
            "cwd": cwd,
            "tool_name": "Read",
            "tool_input": {"file_path": "config.yaml"},
        },
        {
            "session_id": session_id,
            "hook_event_name": "PostToolUse",
            "cwd": cwd,
            "tool_name": "Read",
            "tool_input": {"file_path": "config.yaml"},
        },
        {
            "session_id": session_id,
            "hook_event_name": "PreToolUse",
            "cwd": cwd,
            "tool_name": "Edit",
            "tool_input": {"file_path": "config.yaml", "old_string": "foo", "new_string": "bar"},
        },
        {
            "session_id": session_id,
            "hook_event_name": "PostToolUseFailure",
            "cwd": cwd,
            "tool_name": "Edit",
            "tool_input": {"file_path": "config.yaml", "old_string": "foo", "new_string": "bar"},
            "tool_error": "not found in file",
        },
        {
            "session_id": session_id,
            "hook_event_name": "UserPromptSubmit",
            "cwd": cwd,
            "prompt": "No, not that. Instead use a small diff and explain why.",
        },
        {
            "session_id": session_id,
            "hook_event_name": "UserPromptSubmit",
            "cwd": cwd,
            "prompt": "Please use a small diff and explain why next time.",
        },
        {
            "session_id": session_id,
            "hook_event_name": "PostToolUse",
            "cwd": cwd,
            "tool_name": "Write",
            "tool_input": {
                "file_path": "src/config_loader.py",
                "content": py_content + "\n# worked because we verified the config first",
            },
        },
        {
            "session_id": session_id,
            "hook_event_name": "PostToolUse",
            "cwd": cwd,
            "tool_name": "Bash",
            "tool_input": {"command": "rg -n \"worked because\" ."},
        },
        {
            "session_id": session_id,
            "hook_event_name": "UserPromptSubmit",
            "cwd": cwd,
            "prompt": "We prefer concise output and bullet points.",
        },
        {"session_id": session_id, "hook_event_name": "SessionEnd", "cwd": cwd},
    ]


def _run_scenario(events: List[Dict[str, Any]]) -> None:
    for ev in events:
        _emit_observe_event(ev)


def _run_pipeline(project_dir: Path, cycles: int) -> Dict[str, Any]:
    from lib.bridge_cycle import run_bridge_cycle
    from lib.prediction_loop import process_prediction_cycle
    from lib.validation_loop import process_validation_events
    from lib.memory_capture import process_recent_memory_events

    all_stats: List[Dict[str, Any]] = []
    for _ in range(max(1, cycles)):
        stats = run_bridge_cycle(query="sandbox validation", memory_limit=80, pattern_limit=200)
        all_stats.append(stats)

    # Ensure validation and prediction cycles are also exercised directly.
    validation_stats = process_validation_events(limit=200)
    prediction_stats = process_prediction_cycle(limit=200)
    memory_stats = process_recent_memory_events(limit=80)

    return {
        "bridge_cycles": all_stats,
        "validation_stats": validation_stats,
        "prediction_stats": prediction_stats,
        "memory_stats": memory_stats,
    }


def _run_outputs(project_dir: Path) -> Dict[str, Any]:
    from lib.markdown_writer import write_all_learnings
    from lib.promoter import check_and_promote, get_promoter

    writer_stats = write_all_learnings(project_dir=project_dir)
    promote_stats = check_and_promote(dry_run=False, include_project=True, project_dir=project_dir)
    promo_status = get_promoter(project_dir).get_promotion_status()
    return {
        "markdown": writer_stats,
        "promotion": promote_stats,
        "promotion_status": promo_status,
    }


def _run_chip_evolution(project_dir: Path) -> Dict[str, Any]:
    from lib.chips.runtime import get_runtime
    from lib.chips.scoring import InsightScorer
    from lib.chips.evolution import get_evolution

    runtime = get_runtime()
    insights = runtime.get_insights(limit=200)
    scorer = InsightScorer()
    evolution = get_evolution()

    per_chip: Dict[str, Dict[str, Any]] = {}
    for ins in insights:
        score = scorer.score(ins.__dict__, context={"project_path": str(project_dir)})
        evolution.record_match(ins.chip_id, ins.trigger, score)
        per_chip.setdefault(ins.chip_id, {"insights": 0, "avg_score": 0.0})
        per_chip[ins.chip_id]["insights"] += 1
        per_chip[ins.chip_id]["avg_score"] += score.total

    changes: Dict[str, Any] = {}
    for chip_id in per_chip:
        total = per_chip[chip_id]["insights"]
        per_chip[chip_id]["avg_score"] = (
            per_chip[chip_id]["avg_score"] / max(1, total)
        )
        changes[chip_id] = evolution.evolve_chip(chip_id)

    return {"per_chip": per_chip, "evolution_changes": changes}


def _collect_report(paths: SandboxPaths, pipeline: Dict[str, Any], outputs: Dict[str, Any]) -> Dict[str, Any]:
    from lib.cognitive_learner import get_cognitive_learner
    from lib.queue import get_queue_stats, count_events
    from lib.pattern_detection.worker import get_pattern_backlog
    from lib.validation_loop import get_validation_backlog
    from lib.exposure_tracker import read_recent_exposures
    from lib.outcome_log import get_outcome_stats
    from lib.project_profile import load_profile, completion_score
    from lib.chips.runtime import get_runtime
    from lib.chips.registry import get_registry
    from lib.skills_registry import load_skills_index
    from lib.skills_router import recommend_skills

    cog = get_cognitive_learner()
    insights = list(cog.insights.values())
    by_cat: Dict[str, int] = {}
    reliability_sum = 0.0
    for ins in insights:
        by_cat[ins.category.value] = by_cat.get(ins.category.value, 0) + 1
        reliability_sum += ins.reliability

    avg_reliability = reliability_sum / max(1, len(insights))
    queue_stats = get_queue_stats()
    exposures = read_recent_exposures(limit=200, max_age_s=24 * 3600)

    profile = load_profile(paths.project_dir)
    completion = completion_score(profile)

    runtime = get_runtime()
    chips = get_registry()
    chip_insights = runtime.get_insights(limit=200)

    skills = load_skills_index(force_refresh=True)
    skill_reco = recommend_skills("sandbox validation loop", limit=3)

    coverage = {}
    try:
        from lib.outcome_log import get_insight_outcome_coverage
        coverage = get_insight_outcome_coverage()
    except Exception:
        coverage = {}

    return {
        "meta": {
            "timestamp": time.time(),
            "repo_root": str(REPO_ROOT),
        },
        "paths": {
            "sandbox_root": str(paths.sandbox_root),
            "sandbox_home": str(paths.sandbox_home),
            "workspace": str(paths.workspace_dir),
            "project_dir": str(paths.project_dir),
            "skills_dir": str(paths.skills_dir),
        },
        "queue": queue_stats,
        "pipeline": pipeline,
        "outputs": outputs,
        "cognitive": {
            "total_insights": len(insights),
            "avg_reliability": round(avg_reliability, 4),
            "by_category": by_cat,
            "promoted_count": len([i for i in insights if i.promoted]),
        },
        "pattern_detection": {
            "backlog": get_pattern_backlog(),
            "event_count": count_events(),
        },
        "validation": {"backlog": get_validation_backlog()},
        "exposures": {"recent": len(exposures)},
        "outcomes": {
            "stats": get_outcome_stats(),
            "coverage": coverage,
        },
        "project_profile": {
            "domain": profile.get("domain"),
            "phase": profile.get("phase"),
            "done": profile.get("done"),
            "goals": len(profile.get("goals") or []),
            "milestones": len(profile.get("milestones") or []),
            "completion": completion,
        },
        "chips": {
            "installed": len(chips.get_installed()),
            "active": [c.id for c in chips.get_active_chips(str(paths.project_dir))],
            "insights": len(chip_insights),
        },
        "skills": {
            "indexed": len(skills),
            "recommended": [s.get("skill_id") for s in skill_reco],
        },
    }


def _diff_reports(base: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, Any]:
    changes: List[Dict[str, Any]] = []

    def _walk(path: str, a: Any, b: Any) -> None:
        if isinstance(a, dict) and isinstance(b, dict):
            keys = sorted(set(a.keys()) | set(b.keys()))
            for k in keys:
                _walk(f"{path}.{k}" if path else k, a.get(k), b.get(k))
            return
        if isinstance(a, (int, float)) and isinstance(b, (int, float)):
            if a != b:
                changes.append({"path": path, "baseline": a, "current": b, "delta": b - a})
            return
        if isinstance(a, (str, bool, type(None))) and isinstance(b, (str, bool, type(None))):
            if a != b:
                changes.append({"path": path, "baseline": a, "current": b})
            return

    _walk("", base, current)
    return {"changed": changes, "count": len(changes)}


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))


def main() -> int:
    ap = argparse.ArgumentParser(description="Spark sandbox harness")
    ap.add_argument("--sandbox-dir", default=str(REPO_ROOT / "sandbox" / "spark_sandbox"))
    ap.add_argument("--project-dir", default=None)
    ap.add_argument("--workspace-dir", default=None)
    ap.add_argument("--skills-dir", default=None)
    ap.add_argument("--report", default=None)
    ap.add_argument("--baseline", default=str(REPO_ROOT / "sandbox" / "spark_sandbox_baseline.json"))
    ap.add_argument("--diff", default=str(REPO_ROOT / "sandbox" / "spark_sandbox_diff.json"))
    ap.add_argument("--cycles", type=int, default=2)
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--update-baseline", action="store_true")
    args = ap.parse_args()

    sandbox_root = Path(args.sandbox_dir).resolve()
    sandbox_home = sandbox_root / "home"
    workspace_dir = Path(args.workspace_dir).resolve() if args.workspace_dir else (sandbox_root / "workspace")
    project_dir = Path(args.project_dir).resolve() if args.project_dir else (sandbox_root / "project")
    skills_dir = Path(args.skills_dir).resolve() if args.skills_dir else (sandbox_root / "skills")
    report_path = Path(args.report).resolve() if args.report else (sandbox_root / "report.json")
    baseline_path = Path(args.baseline).resolve()
    diff_path = Path(args.diff).resolve()

    paths = SandboxPaths(
        sandbox_root=sandbox_root,
        sandbox_home=sandbox_home,
        workspace_dir=workspace_dir,
        project_dir=project_dir,
        skills_dir=skills_dir,
        report_path=report_path,
        baseline_path=baseline_path,
        diff_path=diff_path,
    )

    _ensure_dirs(paths, clean=args.clean)
    _set_env(paths)

    # Ensure imports resolve to the repo.
    sys.path.insert(0, str(REPO_ROOT))

    # Patch repo-relative paths after env is set.
    _patch_repo_relative_paths(paths.sandbox_home)

    _seed_project_files(paths.project_dir)
    _seed_skills(paths.skills_dir)
    _seed_project_profile(paths.project_dir)

    session_id = f"sandbox-{int(time.time())}"
    scenario = _build_scenario(paths.project_dir, session_id)
    _run_scenario(scenario)

    pipeline = _run_pipeline(paths.project_dir, cycles=args.cycles)
    outputs = _run_outputs(paths.project_dir)

    chip_evolution = _run_chip_evolution(paths.project_dir)

    report = _collect_report(paths, pipeline, outputs)
    report["chip_evolution"] = chip_evolution

    _write_json(paths.report_path, report)

    if args.update_baseline:
        _write_json(paths.baseline_path, report)
    elif paths.baseline_path.exists():
        baseline = json.loads(paths.baseline_path.read_text())
        diff = _diff_reports(baseline, report)
        _write_json(paths.diff_path, diff)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
