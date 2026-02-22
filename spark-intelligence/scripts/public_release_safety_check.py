#!/usr/bin/env python3
"""Pre-release privacy/safety guard for tracked repository files."""

from __future__ import annotations

import fnmatch
import ast
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = Path(__file__).resolve()
SAST_BASELINE_PATH = REPO_ROOT / "config" / "release_sast_baseline.json"

BOOL_TRUE_VALUES = {"1", "true", "yes", "on"}
BOOL_FALSE_VALUES = {"0", "false", "no", "off"}

FORBIDDEN_FILENAMES = [
    "CLAUDE.md",
    "*test_output.txt",
    "*_test_output.txt",
    "*_test_out.txt",
    "*_test_err.txt",
    "C*Users*test_output*.txt",
]

EXECUTABLE_SCRIPT_SUFFIXES = {".py", ".ps1", ".bat", ".sh", ".cmd"}
PLACEHOLDER_TOKENS = (
    "<REPO_ROOT>",
    "<SPARK_PULSE_DIR>",
    "<SPARKD_PORT>",
    "<PULSE_PORT>",
)
PLACEHOLDER_SCAN_EXCLUDE_PREFIXES = (
    "docs/",
    "tests/",
    "scripts/experimental/",
)

FORBIDDEN_LINE_PATTERNS = {
    "windows_users_path": re.compile(r"[\"']([A-Za-z]:\\Users\\[^\"']+)[\"']", re.IGNORECASE),
    "private_key": re.compile(r"BEGIN (?:RSA|EC|OPENSSH|PRIVATE) PRIVATE KEY"),
    "x509_cert": re.compile(r"BEGIN CERTIFICATE"),
    "aws_key": re.compile(r"AKIA[0-9A-Z]{16}"),
    "github_pat": re.compile(r"gh[pous]_[A-Za-z0-9]{36}"),
    "slack_token": re.compile(r"xox[baprs]-[0-9]{10,12}-[0-9]{10,12}-[A-Za-z0-9]{24}"),
    "bearer_blob": re.compile(r"\bBearer\s+[A-Za-z0-9._-]{30,}\b"),
}

AST_RISK_PATTERNS = {
    "subprocess_shell": {
        "match": lambda node: _is_subprocess_call_with_shell(node),
        "message": "subprocess call with shell=True",
    },
    "unsafe_eval_exec": {
        "match": lambda node: _is_eval_exec_call(node),
        "message": "built-in code execution path (eval/exec)",
    },
    "unsafe_yaml_load": {
        "match": lambda node: _is_yaml_load_without_loader(node),
        "message": "yaml.load without explicit Loader",
    },
    "pickle_load": {
        "match": lambda node: _is_pickle_load(node),
        "message": "pickle.load usage",
    },
}

SAST_RUFF_RULES = (
    "S603",  # subprocess with possible untrusted input
    "S607",  # partial executable path
    "S608",  # string-built SQL
    "S609",  # wildcard command injection
    "S610",  # django extra
    "S611",  # django raw
    "S612",  # logging config from fileConfig/listen
    "S701",  # jinja2 autoescape false
    "S702",  # use of mako templates
)

SAST_RUFF_TARGETS = (
    "lib",
    "hooks",
    "adapters",
    "sparkd.py",
    "bridge_worker.py",
    "spark_watchdog.py",
    "spark_scheduler.py",
    "spark_pulse.py",
    "mind_server.py",
    "cli.py",
)

SAST_ISSUE_DISPLAY_LIMIT = 25


def _parse_env_bool(name: str) -> bool | None:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return None
    if raw in BOOL_TRUE_VALUES:
        return True
    if raw in BOOL_FALSE_VALUES:
        return False
    return None


def _dep_audit_timeout_seconds() -> int:
    raw = os.environ.get("SPARK_RELEASE_DEP_AUDIT_TIMEOUT_SEC", "").strip()
    if not raw:
        return 180
    try:
        return max(30, min(900, int(raw)))
    except Exception:
        return 180


def _load_json_from_mixed_output(raw: str) -> object | None:
    text = (raw or "").strip()
    if not text:
        return None
    for start_token in ("{", "["):
        idx = text.find(start_token)
        if idx < 0:
            continue
        snippet = text[idx:]
        try:
            return json.loads(snippet)
        except Exception:
            continue
    return None


def _is_subprocess_call_with_shell(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    target = _call_target(node.func)
    if target not in {"subprocess.call", "subprocess.run", "subprocess.Popen", "subprocess.check_output", "subprocess.getstatusoutput"}:
        return False
    for kw in node.keywords:
        if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
            return True
    return False


def _is_eval_exec_call(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    return isinstance(node.func, ast.Name) and node.func.id in {"eval", "exec"}


def _is_yaml_load_without_loader(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    target = _call_target(node.func)
    if target != "yaml.load":
        return False
    if len(node.keywords) == 0:
        return True
    for kw in node.keywords:
        if kw.arg == "Loader":
            return False
    return True


def _is_pickle_load(node: ast.AST) -> bool:
    if not isinstance(node, ast.Call):
        return False
    target = _call_target(node.func)
    return target == "pickle.load"


def _call_target(func: ast.AST) -> str:
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        base = _call_target(func.value)
        return f"{base}.{func.attr}"
    return ""


def _git_tracked_files() -> list[str]:
    result = subprocess.run(
        ["git", "ls-files"],
        cwd=str(REPO_ROOT),
        check=True,
        capture_output=True,
        text=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def _is_forbidden_file(path: str) -> bool:
    base = Path(path).name
    for pattern in FORBIDDEN_FILENAMES:
        if fnmatch.fnmatch(base, pattern) or fnmatch.fnmatch(path, pattern):
            return True
    return False


def _scan_file(path: Path) -> list[str]:
    if path.resolve() == SCRIPT_PATH:
        return []

    issues: list[str] = []
    try:
        text = path.read_text(encoding="utf-8-sig", errors="replace")
    except Exception:
        return issues

    if path.suffix == ".py":
        issues.extend(_scan_python_source(path, text, include_risk=_is_ast_risk_scan_allowed(path)))

    rel_path = path.relative_to(REPO_ROOT).as_posix()
    if _is_placeholder_scan_target(rel_path):
        for token in PLACEHOLDER_TOKENS:
            if token in text:
                issues.append(f"placeholder_token: {token} found in executable script")

    for label, pattern in FORBIDDEN_LINE_PATTERNS.items():
        if pattern.search(text):
            issues.append(f"{label}: matched pattern in tracked file content")

    return issues


def _is_placeholder_scan_target(path_str: str) -> bool:
    if any(path_str.startswith(prefix) for prefix in PLACEHOLDER_SCAN_EXCLUDE_PREFIXES):
        return False
    suffix = Path(path_str).suffix.lower()
    return suffix in EXECUTABLE_SCRIPT_SUFFIXES


def _is_ast_risk_scan_allowed(path: Path) -> bool:
    if path.as_posix().split("/")[0] == "tests" or "tests" in path.parts:
        return False
    rel = _norm_rel_path(str(path))
    if rel.startswith("scripts/experimental/"):
        return False
    if path.parent.name == "scripts" and path.name.startswith("test_"):
        return False
    return True


def _scan_python_source(path: Path, text: str, include_risk: bool) -> list[str]:
    issues: list[str] = []
    try:
        tree = ast.parse(text, filename=str(path))
    except SyntaxError as exc:
        issues.append(f"{path}:{exc.lineno or 0}:syntax_error: {exc.msg}")
        return issues

    if not include_risk:
        return issues

    for node in ast.walk(tree):
        lineno = getattr(node, "lineno", 0) or 0
        for item in AST_RISK_PATTERNS.values():
            if item["match"](node):
                issues.append(f"{path}:{lineno}:{item['message']}")

    return issues


def _dependency_audit_is_strict() -> bool:
    configured = _parse_env_bool("SPARK_RELEASE_REQUIRE_DEP_AUDIT")
    if configured is not None:
        return configured
    return True


def _run_dependency_audit() -> list[str]:
    findings: list[str] = []
    strict = _dependency_audit_is_strict()
    skip_audit = (Path(__file__).parent / "SKIP_DEP_AUDIT").exists()
    if skip_audit:
        return findings

    if (Path(__file__).parent / "SKIP_DEPENDENCY_AUDIT").exists():
        return findings

    env_skip = (os.environ.get("SPARK_RELEASE_SKIP_DEP_AUDIT", "").strip().lower() in {"1", "true", "yes", "on"})
    if env_skip:
        return findings

    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip_audit", "--progress-spinner", "off", "--format", "json", "."],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=_dep_audit_timeout_seconds(),
        )
    except Exception as exc:  # pragma: no cover
        if strict:
            return [f"dependency_audit: unable to run pip_audit ({exc})"]
        return findings

    if result.returncode == 0:
        return findings

    if "No known vulnerabilities found" in (result.stdout or ""):
        return findings

    parsed: list[dict[str, object]] = []
    if result.stdout.strip():
        loaded = _load_json_from_mixed_output(result.stdout)
        if isinstance(loaded, list):
            parsed = [row for row in loaded if isinstance(row, dict)]
        elif isinstance(loaded, dict):
            deps = loaded.get("dependencies")
            if isinstance(deps, list):
                parsed = [row for row in deps if isinstance(row, dict)]

    vuln_rows: list[str] = []
    for dep in parsed:
        name = str(dep.get("name") or "")
        version = str(dep.get("version") or "")
        vulns = dep.get("vulns")
        if not isinstance(vulns, list):
            continue
        for vuln in vulns:
            if not isinstance(vuln, dict):
                continue
            vuln_id = str(vuln.get("id") or "unknown")
            fix_versions = vuln.get("fix_versions")
            fix_hint = ""
            if isinstance(fix_versions, list) and fix_versions:
                fix_hint = f" fix={','.join(str(v) for v in fix_versions[:3])}"
            vuln_rows.append(f"{name}@{version} {vuln_id}{fix_hint}".strip())

    if vuln_rows:
        if strict:
            findings.append(f"dependency_audit: {len(vuln_rows)} vulnerability entries reported")
            for row in vuln_rows[:10]:
                findings.append(f"dependency_audit_detail: {row}")
        else:
            print("warning: pip-audit found vulnerabilities (non-blocking)")
    elif strict:
        findings.append("dependency_audit: pip-audit returned non-zero status")

    if result.stderr.strip():
        if strict:
            findings.append(f"dependency_audit_stderr: {result.stderr.strip()[:400]}")
        else:
            print("warning: pip-audit stderr:", result.stderr.strip()[:400])
    return findings


def _sast_scan_is_strict() -> bool:
    configured = _parse_env_bool("SPARK_RELEASE_REQUIRE_SAST")
    if configured is not None:
        return configured
    return True


def _sast_refresh_requested() -> bool:
    return _parse_env_bool("SPARK_RELEASE_REFRESH_SAST_BASELINE") is True


def _sast_baseline_allowed() -> bool:
    """Baseline allowlist is opt-in; default gate is strict/no-baseline."""
    return _parse_env_bool("SPARK_RELEASE_ALLOW_SAST_BASELINE") is True


def _norm_rel_path(path_str: str) -> str:
    try:
        return Path(path_str).resolve().relative_to(REPO_ROOT).as_posix()
    except Exception:
        return Path(path_str).as_posix()


def _ruff_issue_fingerprint(issue: dict[str, object]) -> str:
    path = _norm_rel_path(str(issue.get("filename") or ""))
    code = str(issue.get("code") or "UNKNOWN")
    message = re.sub(r"\s+", " ", str(issue.get("message") or "")).strip()
    return f"{code}|{path}|{message}"


def _load_sast_baseline() -> set[str]:
    if not SAST_BASELINE_PATH.exists():
        return set()
    try:
        payload = json.loads(SAST_BASELINE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return set()
    if not isinstance(payload, dict):
        return set()
    rows = payload.get("ruff_fingerprints")
    if not isinstance(rows, list):
        return set()
    return {str(item).strip() for item in rows if str(item).strip()}


def _write_sast_baseline(issues: list[dict[str, object]]) -> None:
    fingerprints = sorted({_ruff_issue_fingerprint(issue) for issue in issues})
    payload = {
        "generated_at_epoch": int(time.time()),
        "source": "scripts/public_release_safety_check.py",
        "rules": list(SAST_RUFF_RULES),
        "targets": list(SAST_RUFF_TARGETS),
        "ruff_fingerprints": fingerprints,
    }
    SAST_BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SAST_BASELINE_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _run_sast_ruff_gate() -> list[str]:
    findings: list[str] = []
    strict = _sast_scan_is_strict()
    skip_sast = _parse_env_bool("SPARK_RELEASE_SKIP_SAST") is True
    if skip_sast:
        return findings

    cmd = [
        sys.executable,
        "-m",
        "ruff",
        "check",
        *SAST_RUFF_TARGETS,
        "--select",
        ",".join(SAST_RUFF_RULES),
        "--output-format",
        "json",
    ]
    try:
        result = subprocess.run(
            cmd,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except Exception as exc:  # pragma: no cover
        if strict:
            return [f"sast_ruff: unable to run ruff security scan ({exc})"]
        return findings

    if result.returncode not in {0, 1}:
        if strict:
            return [f"sast_ruff: execution failed (exit={result.returncode})", f"sast_ruff_stderr: {result.stderr.strip()[:400]}"]
        return findings

    try:
        parsed = json.loads(result.stdout or "[]")
        issues = [row for row in parsed if isinstance(row, dict)]
    except Exception:
        if strict:
            return ["sast_ruff: failed to parse JSON output"]
        return findings

    if _sast_refresh_requested():
        _write_sast_baseline(issues)
        print(f"info: refreshed SAST baseline at {SAST_BASELINE_PATH.relative_to(REPO_ROOT).as_posix()}")
        return findings

    if not _sast_baseline_allowed():
        if issues:
            findings.append(f"sast_ruff: {len(issues)} finding(s) detected")
            for issue in issues[:SAST_ISSUE_DISPLAY_LIMIT]:
                path = _norm_rel_path(str(issue.get("filename") or ""))
                loc = issue.get("location") or {}
                row = 0
                if isinstance(loc, dict):
                    row = int((loc.get("row") or 0))
                code = str(issue.get("code") or "UNKNOWN")
                msg = str(issue.get("message") or "").strip()
                findings.append(f"sast_ruff_detail: {path}:{row}:{code}: {msg}")
        return findings

    baseline = _load_sast_baseline()
    if not baseline:
        if strict:
            return [
                "sast_ruff: missing baseline file config/release_sast_baseline.json",
                "sast_ruff: run with SPARK_RELEASE_REFRESH_SAST_BASELINE=1 to create baseline intentionally",
            ]
        return findings

    unexpected: list[dict[str, object]] = []
    seen_fingerprints: set[str] = set()
    for issue in issues:
        fingerprint = _ruff_issue_fingerprint(issue)
        seen_fingerprints.add(fingerprint)
        if fingerprint not in baseline:
            unexpected.append(issue)

    stale = baseline - seen_fingerprints
    if stale:
        print(f"info: SAST baseline has {len(stale)} stale fingerprints (consider refreshing baseline)")

    if unexpected:
        findings.append(f"sast_ruff: {len(unexpected)} unapproved finding(s) not present in baseline")
        for issue in unexpected[:SAST_ISSUE_DISPLAY_LIMIT]:
            path = _norm_rel_path(str(issue.get("filename") or ""))
            loc = issue.get("location") or {}
            row = 0
            if isinstance(loc, dict):
                row = int((loc.get("row") or 0))
            code = str(issue.get("code") or "UNKNOWN")
            msg = str(issue.get("message") or "").strip()
            findings.append(f"sast_ruff_detail: {path}:{row}:{code}: {msg}")
    return findings


def main() -> int:
    files = _git_tracked_files()
    findings: list[str] = []

    for path_str in files:
        if _is_forbidden_file(path_str):
            findings.append(f"[forbidden_file] {path_str}")
            continue

        path = REPO_ROOT / path_str
        findings.extend(f"{path_str}: {issue}" for issue in _scan_file(path))

    findings.extend(_run_dependency_audit())
    findings.extend(_run_sast_ruff_gate())

    if findings:
        print("Public release safety check failed. Blocked items:")
        for item in findings:
            print(f"- {item}")
        return 1

    print("Public release safety check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
