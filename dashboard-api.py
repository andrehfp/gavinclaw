#!/usr/bin/env python3
import json
import re
import subprocess
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent
OPENCLAW_HOME = Path.home() / ".openclaw"
SYSTEM_SKILLS_DIR = Path.home() / ".codex" / "skills" / ".system"
WORKSPACE_SKILLS_DIR = BASE_DIR / "skills"
MEMORY_DIR = BASE_DIR / "memory"
GOALS_PATH = BASE_DIR / "goals.json"
TODOS_PATH = BASE_DIR / "todos.json"
PORT = 8888


def run_cmd(command: list[str], timeout: int = 12) -> dict[str, Any]:
    try:
        proc = subprocess.run(
            command,
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {
            "ok": proc.returncode == 0,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "code": proc.returncode,
        }
    except Exception as exc:
        return {"ok": False, "stdout": "", "stderr": str(exc), "code": -1}


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ensure_goals() -> list[dict[str, Any]]:
    default: list[dict[str, Any]] = []
    if not GOALS_PATH.exists():
        write_json(GOALS_PATH, default)
        return default
    data = read_json(GOALS_PATH, default)
    return data if isinstance(data, list) else default


def ensure_todos() -> list[dict[str, Any]]:
    default: list[dict[str, Any]] = []
    if not TODOS_PATH.exists():
        write_json(TODOS_PATH, default)
        return default
    data = read_json(TODOS_PATH, default)
    return data if isinstance(data, list) else default


def fmt_ms(ms: Any) -> str | None:
    try:
        return datetime.fromtimestamp(int(ms) / 1000).isoformat()
    except Exception:
        return None


def parse_sessions_cli(stdout: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in stdout.splitlines():
        text = line.rstrip()
        if not text:
            continue
        if text.startswith(("Session store", "Sessions listed", "Kind")):
            continue
        if not re.match(r"^(group|direct)\s", text):
            continue

        parts = re.split(r"\s{2,}", text.strip())
        if len(parts) < 5:
            continue

        tokens = parts[4]
        ctx_pct = None
        pct_match = re.search(r"\((\d+)%\)", tokens)
        if pct_match:
            ctx_pct = int(pct_match.group(1))

        rows.append(
            {
                "kind": parts[0],
                "key": parts[1],
                "age": parts[2],
                "model": parts[3],
                "tokens": tokens,
                "ctxPercent": ctx_pct,
                "flags": parts[5] if len(parts) > 5 else "",
            }
        )
    return rows


def sessions_from_store() -> list[dict[str, Any]]:
    store_path = OPENCLAW_HOME / "agents" / "main" / "sessions" / "sessions.json"
    store = read_json(store_path, {})
    if not isinstance(store, dict):
        return []

    now_ms = int(time.time() * 1000)
    rows: list[dict[str, Any]] = []
    for key, data in store.items():
        if not isinstance(data, dict):
            continue
        updated_ms = int(data.get("updatedAt") or 0)
        age_min = max(0, (now_ms - updated_ms) // 60000)
        if age_min < 1:
            age = "just now"
        elif age_min < 60:
            age = f"{age_min}m ago"
        elif age_min < 1440:
            age = f"{age_min // 60}h ago"
        else:
            age = f"{age_min // 1440}d ago"

        total = int(data.get("totalTokens") or 0)
        ctx = int(data.get("contextTokens") or 0)
        pct = int((total / ctx) * 100) if total and ctx else None
        token_label = f"{total//1000}k/{ctx//1000}k ({pct}%)" if total and ctx else "-"

        rows.append(
            {
                "kind": data.get("chatType", "direct"),
                "key": key,
                "age": age,
                "model": data.get("model", "n/a"),
                "tokens": token_label,
                "ctxPercent": pct,
                "flags": "",
                "updatedAt": fmt_ms(updated_ms),
            }
        )

    rows.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
    return rows


def get_sessions() -> list[dict[str, Any]]:
    cmd = run_cmd(["openclaw", "sessions", "list"], timeout=12)
    if not cmd["ok"] or not cmd["stdout"].strip():
        cmd = run_cmd(["openclaw", "sessions"], timeout=12)
    sessions = parse_sessions_cli(cmd.get("stdout", ""))
    if sessions:
        return sessions
    return sessions_from_store()


def schedule_label(schedule: dict[str, Any]) -> str:
    kind = schedule.get("kind")
    if kind == "cron":
        expr = schedule.get("expr", "")
        tz = schedule.get("tz", "")
        return f"{expr} ({tz})" if tz else expr
    if kind == "every":
        every = int(schedule.get("everyMs") or 0)
        seconds = max(1, every // 1000)
        if seconds % 3600 == 0:
            return f"a cada {seconds // 3600}h"
        if seconds % 60 == 0:
            return f"a cada {seconds // 60}min"
        return f"a cada {seconds}s"
    return "n/d"


def crons_from_store() -> list[dict[str, Any]]:
    jobs_path = OPENCLAW_HOME / "cron" / "jobs.json"
    raw = read_json(jobs_path, {})
    jobs = raw.get("jobs", []) if isinstance(raw, dict) else []
    if not isinstance(jobs, list):
        return []

    rows: list[dict[str, Any]] = []
    for job in jobs:
        if not isinstance(job, dict):
            continue
        state = job.get("state") or {}
        rows.append(
            {
                "id": job.get("id"),
                "name": job.get("name", "sem nome"),
                "enabled": bool(job.get("enabled", True)),
                "schedule": schedule_label(job.get("schedule") or {}),
                "nextRunAt": fmt_ms(state.get("nextRunAtMs")),
                "lastRunAt": fmt_ms(state.get("lastRunAtMs")),
                "lastStatus": state.get("lastStatus"),
                "lastDurationMs": state.get("lastDurationMs"),
            }
        )

    rows.sort(key=lambda x: (x.get("name") or "").lower())
    return rows


def get_crons() -> list[dict[str, Any]]:
    # openclaw cron list is attempted to respect the requirement; when parsing is not stable, fallback to jobs.json.
    cmd = run_cmd(["openclaw", "cron", "list"], timeout=12)
    if cmd["ok"] and cmd["stdout"].strip():
        # Some versions output text tables with unstable columns; keep raw for debug and still use store as canonical.
        pass
    return crons_from_store()


def parse_skill_file(skill_md: Path) -> str:
    try:
        lines = skill_md.read_text(encoding="utf-8").splitlines()
    except Exception:
        return ""
    for line in lines:
        cleaned = line.strip()
        if not cleaned:
            continue
        if cleaned.startswith("#"):
            continue
        return cleaned[:180]
    return ""


def collect_skills_from(root: Path, source: str) -> list[dict[str, Any]]:
    if not root.exists():
        return []
    rows: list[dict[str, Any]] = []
    for skill_md in sorted(root.glob("*/SKILL.md")):
        name = skill_md.parent.name
        rows.append(
            {
                "name": name,
                "source": source,
                "path": str(skill_md),
                "description": parse_skill_file(skill_md),
            }
        )
    return rows


def get_skills() -> list[dict[str, Any]]:
    skills = []
    skills.extend(collect_skills_from(WORKSPACE_SKILLS_DIR, "workspace"))
    skills.extend(collect_skills_from(SYSTEM_SKILLS_DIR, "system"))
    return sorted(skills, key=lambda x: (x.get("source", ""), x.get("name", "").lower()))


def get_memory_index() -> list[dict[str, Any]]:
    files: list[dict[str, Any]] = []

    memory_md = BASE_DIR / "MEMORY.md"
    if memory_md.exists():
        st = memory_md.stat()
        files.append(
            {
                "name": "MEMORY.md",
                "path": "MEMORY.md",
                "size": st.st_size,
                "updatedAt": datetime.fromtimestamp(st.st_mtime).isoformat(),
            }
        )

    if MEMORY_DIR.exists():
        for path in sorted(MEMORY_DIR.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True):
            st = path.stat()
            files.append(
                {
                    "name": path.name,
                    "path": f"memory/{path.name}",
                    "size": st.st_size,
                    "updatedAt": datetime.fromtimestamp(st.st_mtime).isoformat(),
                }
            )

    return files


def resolve_memory_file(raw_path: str) -> Path | None:
    decoded = unquote(raw_path).strip().lstrip("/")
    if decoded == "MEMORY.md":
        target = (BASE_DIR / "MEMORY.md").resolve()
        return target if target.exists() else None

    if decoded.startswith("memory/"):
        target = (BASE_DIR / decoded).resolve()
    else:
        target = (MEMORY_DIR / decoded).resolve()

    if not str(target).startswith(str(MEMORY_DIR.resolve())):
        return None
    if not target.exists() or not target.is_file() or target.suffix.lower() != ".md":
        return None
    return target


def get_status() -> dict[str, Any]:
    sessions = get_sessions()
    crons = get_crons()
    memory_files = get_memory_index()
    skills = get_skills()
    goals = ensure_goals()
    todos = ensure_todos()

    active_sessions = sum(1 for s in sessions if "just now" in str(s.get("age", "")) or "m ago" in str(s.get("age", "")))
    enabled_crons = sum(1 for c in crons if c.get("enabled"))

    token_samples = [s.get("tokens", "") for s in sessions]
    token_total_text = " • ".join(t for t in token_samples[:4] if t)

    return {
        "assistant": "Gavin",
        "online": True,
        "generatedAt": datetime.now().isoformat(),
        "stats": {
            "sessionsTotal": len(sessions),
            "sessionsActive": active_sessions,
            "cronsTotal": len(crons),
            "cronsEnabled": enabled_crons,
            "skillsTotal": len(skills),
            "memoryFiles": len(memory_files),
            "goalsTotal": len(goals),
            "todosTotal": len(todos),
            "tokensPreview": token_total_text,
        },
    }


class DashboardAPIHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: Any, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self) -> Any:
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b""
        if not raw:
            return None
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/status":
            self._send_json(get_status())
            return
        if path == "/api/sessions":
            self._send_json({"sessions": get_sessions(), "generatedAt": datetime.now().isoformat()})
            return
        if path == "/api/crons":
            self._send_json({"crons": get_crons(), "generatedAt": datetime.now().isoformat()})
            return
        if path == "/api/memory":
            self._send_json({"files": get_memory_index(), "generatedAt": datetime.now().isoformat()})
            return
        if path.startswith("/api/memory/"):
            raw_name = path[len("/api/memory/") :]
            target = resolve_memory_file(raw_name)
            if not target:
                self._send_json({"error": "Arquivo não encontrado"}, status=404)
                return
            content = target.read_text(encoding="utf-8", errors="replace")
            rel = target.relative_to(BASE_DIR)
            self._send_json(
                {
                    "file": str(rel),
                    "content": content,
                    "size": target.stat().st_size,
                    "updatedAt": datetime.fromtimestamp(target.stat().st_mtime).isoformat(),
                }
            )
            return
        if path == "/api/skills":
            self._send_json({"skills": get_skills(), "generatedAt": datetime.now().isoformat()})
            return
        if path == "/api/goals":
            self._send_json({"goals": ensure_goals()})
            return
        if path == "/api/todos":
            self._send_json({"todos": ensure_todos()})
            return

        if path == "/":
            self.path = "/dashboard.html"
        return super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        payload = self._read_json_body()
        if payload is None:
            self._send_json({"error": "JSON inválido"}, status=400)
            return

        if path == "/api/goals":
            goals = payload.get("goals") if isinstance(payload, dict) else payload
            if not isinstance(goals, list):
                self._send_json({"error": "Formato inválido. Use {\"goals\": []}"}, status=400)
                return
            write_json(GOALS_PATH, goals)
            self._send_json({"ok": True, "goals": goals})
            return

        if path == "/api/todos":
            todos = payload.get("todos") if isinstance(payload, dict) else payload
            if not isinstance(todos, list):
                self._send_json({"error": "Formato inválido. Use {\"todos\": []}"}, status=400)
                return
            write_json(TODOS_PATH, todos)
            self._send_json({"ok": True, "todos": todos})
            return

        self._send_json({"error": "Endpoint não encontrado"}, status=404)

    def log_message(self, fmt: str, *args: Any) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{stamp}] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    ensure_goals()
    ensure_todos()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), DashboardAPIHandler)
    print(f"Dashboard API em http://127.0.0.1:{PORT}")
    print("Endpoints:")
    print("  GET  /api/status")
    print("  GET  /api/sessions")
    print("  GET  /api/crons")
    print("  GET  /api/memory")
    print("  GET  /api/memory/<file>")
    print("  GET  /api/skills")
    print("  GET  /api/goals")
    print("  POST /api/goals")
    print("  GET  /api/todos")
    print("  POST /api/todos")
    print("Static: /dashboard.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
