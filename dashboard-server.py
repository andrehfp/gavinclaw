#!/usr/bin/env python3
import json
import os
import re
import subprocess
import time
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List
from urllib.parse import urlparse, parse_qs

# Import Content Engine
import content_engine

BASE_DIR = Path(__file__).resolve().parent
OPENCLAW_HOME = Path.home() / ".openclaw"
TASKS_PATH = BASE_DIR / "tasks.json"
PORT = 8888
CACHE_TTL_SECONDS = 5
METRICS_CACHE_TTL = 60

_CACHE: Dict[str, Any] = {"ts": 0.0, "payload": None}
_METRICS_CACHE: Dict[str, Any] = {"ts": 0.0, "payload": None}


def run_cmd(command: List[str], timeout: int = 15) -> Dict[str, Any]:
    started = time.time()
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
            "exitCode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
            "durationMs": int((time.time() - started) * 1000),
            "command": " ".join(command),
        }
    except Exception as exc:
        return {
            "ok": False,
            "exitCode": -1,
            "stdout": "",
            "stderr": str(exc),
            "durationMs": int((time.time() - started) * 1000),
            "command": " ".join(command),
        }


def read_json(path: Path, default: Any) -> Any:
    try:
        if not path.exists():
            return default
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ensure_tasks() -> List[Dict[str, Any]]:
    default: List[Dict[str, Any]] = []
    if not TASKS_PATH.exists():
        write_json(TASKS_PATH, default)
        return default
    data = read_json(TASKS_PATH, default)
    if not isinstance(data, list):
        write_json(TASKS_PATH, default)
        return default
    return data


def fmt_ts(ms: Any) -> str | None:
    try:
        if not ms:
            return None
        return datetime.fromtimestamp(int(ms) / 1000).isoformat()
    except Exception:
        return None


def human_every(ms: int) -> str:
    seconds = max(1, ms // 1000)
    if seconds % 3600 == 0:
        return f"a cada {seconds // 3600}h"
    if seconds % 60 == 0:
        return f"a cada {seconds // 60}min"
    return f"a cada {seconds}s"


def schedule_label(schedule: Dict[str, Any]) -> str:
    if not schedule:
        return "n/d"
    kind = schedule.get("kind")
    if kind == "cron":
        expr = schedule.get("expr", "")
        tz = schedule.get("tz")
        return f"{expr} ({tz})" if tz else expr
    if kind == "every":
        return human_every(int(schedule.get("everyMs", 0)))
    return kind or "n/d"


def parse_sessions_cli(stdout: str) -> List[Dict[str, Any]]:
    sessions: List[Dict[str, Any]] = []
    for raw in stdout.splitlines():
        line = raw.rstrip()
        if not line or line.startswith("Session store") or line.startswith("Sessions listed") or line.startswith("Kind"):
            continue
        if not re.match(r"^(group|direct)\s", line):
            continue
        parts = re.split(r"\s{2,}", line.strip())
        if len(parts) < 5:
            continue
        kind = parts[0]
        key = parts[1] if len(parts) > 1 else ""
        age = parts[2] if len(parts) > 2 else ""
        model = parts[3] if len(parts) > 3 else ""
        tokens = parts[4] if len(parts) > 4 else "-"
        flags = parts[5] if len(parts) > 5 else ""
        ctx_percent = None
        m = re.search(r"\((\d+)%\)", tokens)
        if m:
            ctx_percent = int(m.group(1))
        sessions.append(
            {
                "kind": kind,
                "key": key,
                "age": age,
                "model": model,
                "tokens": tokens,
                "ctxPercent": ctx_percent,
                "flags": flags,
                "source": "cli",
            }
        )
    return sessions


def sessions_from_store() -> List[Dict[str, Any]]:
    path = OPENCLAW_HOME / "agents" / "main" / "sessions" / "sessions.json"
    store = read_json(path, {})
    now_ms = int(time.time() * 1000)
    rows = []
    for key, item in store.items():
        updated_ms = int(item.get("updatedAt") or 0)
        delta_ms = max(0, now_ms - updated_ms)
        delta_min = delta_ms // 60000
        if delta_min < 1:
            age = "just now"
        elif delta_min < 60:
            age = f"{delta_min}m ago"
        elif delta_min < 1440:
            age = f"{delta_min // 60}h ago"
        else:
            age = f"{delta_min // 1440}d ago"
        ctx = item.get("contextTokens") or 0
        total = item.get("totalTokens") or 0
        ctx_percent = int((total / ctx) * 100) if ctx else None
        tokens = f"{int(total/1000)}k/{int(ctx/1000)}k ({ctx_percent}%)" if ctx and total else "-"
        rows.append(
            {
                "kind": item.get("chatType", "direct"),
                "key": key,
                "age": age,
                "model": item.get("model", "n/a"),
                "tokens": tokens,
                "ctxPercent": ctx_percent,
                "flags": "",
                "source": "store",
                "updatedAt": fmt_ts(updated_ms),
            }
        )
    rows.sort(key=lambda x: x.get("updatedAt") or "", reverse=True)
    return rows[:12]


def cron_from_store() -> List[Dict[str, Any]]:
    path = OPENCLAW_HOME / "cron" / "jobs.json"
    data = read_json(path, {})
    jobs = data.get("jobs", []) if isinstance(data, dict) else []
    rows = []
    for job in jobs:
        state = job.get("state") or {}
        rows.append(
            {
                "id": job.get("id"),
                "name": job.get("name", "sem nome"),
                "enabled": bool(job.get("enabled", True)),
                "schedule": schedule_label(job.get("schedule") or {}),
                "nextRunAt": fmt_ts(state.get("nextRunAtMs")),
                "lastRunAt": fmt_ts(state.get("lastRunAtMs")),
                "lastStatus": state.get("lastStatus"),
                "lastDurationMs": state.get("lastDurationMs"),
                "source": "store",
            }
        )
    rows.sort(key=lambda x: x.get("name", "").lower())
    return rows


def parse_ready_skills(stdout: str) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for line in stdout.splitlines():
        if "│ ✓ ready" not in line:
            continue
        cells = [c.strip() for c in line.split("│")]
        if len(cells) < 5:
            continue
        skill = cells[2]
        desc = cells[3]
        source = cells[4]
        rows.append({"name": skill, "description": desc, "source": source})
    return rows


def list_memory_files(limit: int = 8) -> List[Dict[str, Any]]:
    mem_dir = BASE_DIR / "memory"
    if not mem_dir.exists():
        return []
    files = sorted(
        [p for p in mem_dir.glob("*.md") if p.is_file()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    items = []
    for f in files[:limit]:
        stat = f.stat()
        items.append(
            {
                "name": f.name,
                "size": stat.st_size,
                "updatedAt": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )
    return items


def collect_status() -> Dict[str, Any]:
    version_cmd = run_cmd(["openclaw", "--version"], timeout=8)
    sessions_cmd = run_cmd(["openclaw", "sessions"], timeout=12)
    cron_cmd = run_cmd(["openclaw", "cron", "list"], timeout=12)
    skills_cmd = run_cmd(["openclaw", "skills", "list"], timeout=20)

    sessions = parse_sessions_cli(sessions_cmd.get("stdout", "")) if sessions_cmd["ok"] else []
    if not sessions:
        sessions = sessions_from_store()

    cron_jobs = cron_from_store()

    ready_skills = parse_ready_skills(skills_cmd.get("stdout", "")) if skills_cmd["ok"] else []

    enabled_count = sum(1 for c in cron_jobs if c.get("enabled"))
    model_count: Dict[str, int] = {}
    for s in sessions:
        model = s.get("model") or "n/a"
        model_count[model] = model_count.get(model, 0) + 1

    return {
        "generatedAt": datetime.now().isoformat(),
        "version": version_cmd.get("stdout") or "unknown",
        "summary": {
            "cronTotal": len(cron_jobs),
            "cronEnabled": enabled_count,
            "sessionsTotal": len(sessions),
            "models": model_count,
            "commandsOk": {
                "openclaw --version": version_cmd["ok"],
                "openclaw sessions": sessions_cmd["ok"],
                "openclaw cron list": cron_cmd["ok"],
                "openclaw skills list": skills_cmd["ok"],
            },
        },
        "cronJobs": cron_jobs,
        "sessions": sessions[:12],
        "skills": ready_skills[:12],
        "memoryFiles": list_memory_files(),
        "commands": {
            "version": version_cmd,
            "sessions": sessions_cmd,
            "cron": cron_cmd,
            "skills": skills_cmd,
        },
    }


def list_background_processes(limit: int = 12) -> List[Dict[str, Any]]:
    cmd = run_cmd(["ps", "-eo", "pid,tty,stat,etimes,comm,args", "--sort=-etimes"], timeout=5)
    if not cmd.get("ok"):
        return []
    rows: List[Dict[str, Any]] = []
    keywords = ("openclaw", "dashboard", "python", "node", "worker", "cron", "codex")
    for idx, line in enumerate(cmd.get("stdout", "").splitlines()):
        if idx == 0:
            continue
        cols = line.strip().split(None, 5)
        if len(cols) < 6:
            continue
        pid, tty, stat, etimes, comm, args = cols
        args_l = args.lower()
        if not any(k in args_l for k in keywords):
            continue
        if "ps -eo pid,tty,stat,etimes,comm,args" in args_l:
            continue
        if tty != "?" and "dashboard" not in args_l and "openclaw" not in args_l:
            continue
        rows.append(
            {
                "pid": int(pid),
                "tty": tty,
                "status": stat,
                "elapsedSeconds": int(etimes),
                "command": comm,
                "args": args[:220],
            }
        )
    rows.sort(key=lambda x: x.get("elapsedSeconds", 0), reverse=True)
    return rows[:limit]


def recent_events(cron_jobs: List[Dict[str, Any]], limit: int = 12) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for job in cron_jobs:
        last = job.get("lastRunAt")
        status = str(job.get("lastStatus") or "unknown").lower()
        if not last:
            continue
        if any(s in status for s in ("fail", "error", "crash")):
            kind = "failure"
        else:
            kind = "completion"
        items.append(
            {
                "kind": kind,
                "name": job.get("name", "sem nome"),
                "status": job.get("lastStatus") or "unknown",
                "at": last,
                "durationMs": job.get("lastDurationMs"),
            }
        )
    items.sort(key=lambda x: x.get("at") or "", reverse=True)
    return items[:limit]


def activity_feed(force: bool = False) -> Dict[str, Any]:
    status = get_status(force=force)
    sessions = status.get("sessions", [])
    active_sessions = [
        s
        for s in sessions
        if "just now" in str(s.get("age", "")).lower() or "m ago" in str(s.get("age", "")).lower()
    ]
    cron_jobs = status.get("cronJobs", [])
    return {
        "generatedAt": datetime.now().isoformat(),
        "activeSessions": active_sessions,
        "processes": list_background_processes(),
        "recent": recent_events(cron_jobs),
    }


def get_status(force: bool = False) -> Dict[str, Any]:
    now = time.time()
    if not force and _CACHE["payload"] and (now - _CACHE["ts"]) < CACHE_TTL_SECONDS:
        return _CACHE["payload"]
    payload = collect_status()
    _CACHE["ts"] = now
    _CACHE["payload"] = payload
    return payload


def _strip_ansi(text: str) -> str:
    return re.sub(r"\x1b\[[0-9;]*m", "", text)


def _parse_revenue(stdout: str) -> Dict[str, Any]:
    text = _strip_ansi(stdout)
    mrr = 0.0
    revenue_24h = 0.0
    for line in text.splitlines():
        line_s = line.strip()
        m = re.search(r"MRR\s*\(30d\):\s*\$\s*([\d,.]+)", line_s)
        if m:
            mrr = float(m.group(1).replace(",", ""))
        m = re.search(r"1d:\s*\$\s*([\d,.]+)", line_s)
        if m:
            revenue_24h = float(m.group(1).replace(",", ""))
    return {"mrr": mrr, "revenue24h": revenue_24h}


def _parse_users(stdout: str) -> Dict[str, Any]:
    text = _strip_ansi(stdout)
    total = 0
    signups_7d = 0
    for line in text.splitlines():
        line_s = line.strip()
        m = re.search(r"Total:\s+(\d+)", line_s)
        if m:
            total = int(m.group(1))
        m = re.search(r"7d:\s+(\d+)", line_s)
        if m:
            signups_7d = int(m.group(1))
    return {"totalUsers": total, "signups7d": signups_7d}


def _parse_ig(stdout: str) -> Dict[str, Any]:
    text = _strip_ansi(stdout)
    followers = 0
    posts = 0
    for line in text.splitlines():
        line_s = line.strip()
        m = re.search(r"Followers:\s+(\d+)", line_s)
        if m:
            followers = int(m.group(1))
        m = re.search(r"Posts:\s+(\d+)", line_s)
        if m:
            posts = int(m.group(1))
    return {"followers": followers, "posts": posts}


def collect_metrics() -> Dict[str, Any]:
    rev_cmd = run_cmd(["maia", "rev", "--days", "1"], timeout=15)
    users_cmd = run_cmd(["maia", "users", "--days", "7"], timeout=15)
    ig_cmd = run_cmd(["maia", "ig", "status"], timeout=15)

    rev = _parse_revenue(rev_cmd.get("stdout", "")) if rev_cmd["ok"] else {"mrr": 0, "revenue24h": 0}
    users = _parse_users(users_cmd.get("stdout", "")) if users_cmd["ok"] else {"totalUsers": 0, "signups7d": 0}
    ig = _parse_ig(ig_cmd.get("stdout", "")) if ig_cmd["ok"] else {"followers": 0, "posts": 0}

    reddit_karma = 0
    data_json_path = BASE_DIR / "moldaspace" / "dashboard" / "data.json"
    data = read_json(data_json_path, {})
    if isinstance(data, dict):
        reddit_karma = int(data.get("karma", 0))

    return {
        "generatedAt": datetime.now().isoformat(),
        "moldaspace": {
            "mrr": rev["mrr"],
            "revenue24h": rev["revenue24h"],
            "totalUsers": users["totalUsers"],
            "signups7d": users["signups7d"],
            "redditKarma": reddit_karma,
        },
        "instagram": ig,
    }


def get_metrics() -> Dict[str, Any]:
    now = time.time()
    if _METRICS_CACHE["payload"] and (now - _METRICS_CACHE["ts"]) < METRICS_CACHE_TTL:
        return _METRICS_CACHE["payload"]
    payload = collect_metrics()
    _METRICS_CACHE["ts"] = now
    _METRICS_CACHE["payload"] = payload
    return payload


class DashboardHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: Dict[str, Any], status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except BrokenPipeError:
            pass

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
        if path == "/api/metrics":
            self._send_json(get_metrics())
            return
        if path == "/api/status":
            self._send_json(get_status(force=False))
            return
        if path == "/api/refresh":
            self._send_json(get_status(force=True))
            return
        if path == "/api/sessions":
            status = get_status(force=False)
            self._send_json({"sessions": status.get("sessions", []), "generatedAt": datetime.now().isoformat()})
            return
        if path == "/api/activity":
            self._send_json(activity_feed(force=False))
            return
        if path == "/api/tasks":
            self._send_json({"tasks": ensure_tasks(), "generatedAt": datetime.now().isoformat()})
            return
        
        # Content Engine endpoints
        if path == "/api/content/posts":
            query = parse_qs(urlparse(self.path).query)
            platform = query.get("platform", [None])[0]
            status = query.get("status", [None])[0]
            from_date = query.get("from", [None])[0]
            to_date = query.get("to", [None])[0]
            
            posts = content_engine.get_posts(platform, status, from_date, to_date)
            self._send_json({"posts": posts, "generatedAt": datetime.now().isoformat()})
            return
        
        if path == "/api/content/scheduled":
            scheduled = content_engine.get_scheduled()
            self._send_json({"scheduled": scheduled, "generatedAt": datetime.now().isoformat()})
            return
        
        if path == "/api/content/queue":
            queue = content_engine.get_queue()
            self._send_json({"queue": queue, "generatedAt": datetime.now().isoformat()})
            return
        
        if path == "/api/content/stats":
            query = parse_qs(urlparse(self.path).query)
            platform = query.get("platform", [None])[0]
            days = int(query.get("days", [30])[0])
            
            stats = content_engine.get_stats(platform, days)
            self._send_json({"stats": stats, "generatedAt": datetime.now().isoformat()})
            return
        
        # Serve media files from output/
        if path.startswith("/media/"):
            file_path = BASE_DIR / path[7:]  # strip /media/
            if file_path.exists() and file_path.is_file() and str(file_path).startswith(str(BASE_DIR)):
                ext = file_path.suffix.lower()
                mime_map = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".mp4": "video/mp4", ".webp": "image/webp"}
                content_type = mime_map.get(ext, "application/octet-stream")
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Cache-Control", "public, max-age=3600")
                data = file_path.read_bytes()
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_error(404, "File not found")
            return
        
        if path == "/":
            self.path = "/dashboard.html"
        return super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        payload = self._read_json_body()
        
        if path == "/api/tasks":
            if payload is None:
                self._send_json({"error": "JSON inválido"}, status=400)
                return
            tasks = payload.get("tasks") if isinstance(payload, dict) else payload
            if not isinstance(tasks, list):
                self._send_json({"error": "Formato inválido. Use {\"tasks\": []}"}, status=400)
                return
            write_json(TASKS_PATH, tasks)
            self._send_json({"ok": True, "tasks": tasks})
            return
        
        # Content Engine endpoints
        if path == "/api/content/posts":
            if payload is None:
                self._send_json({"error": "JSON inválido"}, status=400)
                return
            
            required_fields = ["platform", "content_type", "title"]
            for field in required_fields:
                if field not in payload:
                    self._send_json({"error": f"Campo obrigatório: {field}"}, status=400)
                    return
            
            try:
                post_id = content_engine.add_post(
                    platform=payload["platform"],
                    content_type=payload["content_type"],
                    title=payload["title"],
                    **{k: v for k, v in payload.items() if k not in required_fields}
                )
                self._send_json({"ok": True, "post_id": post_id})
            except Exception as e:
                self._send_json({"error": f"Erro ao criar post: {str(e)}"}, status=500)
            return
        
        if path == "/api/content/queue/reorder":
            if payload is None or "post_id" not in payload or "new_position" not in payload:
                self._send_json({"error": "Campos obrigatórios: post_id, new_position"}, status=400)
                return
            
            try:
                success = content_engine.reorder_queue(
                    post_id=payload["post_id"],
                    new_position=int(payload["new_position"])
                )
                if success:
                    self._send_json({"ok": True})
                else:
                    self._send_json({"error": "Post não encontrado na fila"}, status=404)
            except Exception as e:
                self._send_json({"error": f"Erro ao reordenar: {str(e)}"}, status=500)
            return
        
        self._send_json({"error": "Endpoint não encontrado"}, status=404)
    
    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        payload = self._read_json_body()
        
        # Handle /api/content/posts/{id}
        if path.startswith("/api/content/posts/"):
            post_id = path.split("/")[-1]
            
            if payload is None:
                self._send_json({"error": "JSON inválido"}, status=400)
                return
            
            try:
                success = content_engine.update_post(post_id, **payload)
                if success:
                    self._send_json({"ok": True})
                else:
                    self._send_json({"error": "Post não encontrado"}, status=404)
            except Exception as e:
                self._send_json({"error": f"Erro ao atualizar post: {str(e)}"}, status=500)
            return
        
        self._send_json({"error": "Endpoint não encontrado"}, status=404)

    def log_message(self, fmt: str, *args: Any) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{stamp}] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    os.chdir(BASE_DIR)
    ensure_tasks()
    
    # Initialize Content Engine
    print("🗂️ Initializing Content Engine...")
    content_engine.init_db()
    
    server = ThreadingHTTPServer(("0.0.0.0", PORT), DashboardHandler)
    print(f"Dashboard server em http://127.0.0.1:{PORT}")
    print("Endpoints:")
    print("  Business: /api/metrics (60s cache)")
    print("  System: /api/status, /api/refresh, /api/sessions, /api/activity, /api/tasks")
    print("  Content: /api/content/posts, /api/content/scheduled, /api/content/queue, /api/content/stats")
    print("  Actions: POST /api/content/posts, PUT /api/content/posts/{id}, POST /api/content/queue/reorder")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
