#!/usr/bin/env python3
"""ViralClaw Dashboard — single-file local dashboard for the ViralClaw API."""

import argparse
import json
import os
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def _load_config():
    api_key = os.environ.get("VIRALCLAW_API_KEY", "")
    api_url = os.environ.get("VIRALCLAW_API_URL", "").rstrip("/")
    if not api_key or not api_url:
        cfg_path = Path.home() / ".openclaw" / "config.json"
        if cfg_path.exists():
            try:
                cfg = json.loads(cfg_path.read_text())
                vc = cfg if not isinstance(cfg, dict) else cfg
                api_key = api_key or vc.get("viralclaw", {}).get("api_key", "")
                api_url = api_url or vc.get("viralclaw", {}).get("api_url", "").rstrip("/")
            except Exception:
                pass
    return api_key, api_url or "https://api.viral-claw.com"

API_KEY, API_URL = _load_config()

# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def api_get(path):
    url = f"{API_URL}{path}"
    req = urllib.request.Request(url, headers={"X-API-Key": API_KEY})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

# ---------------------------------------------------------------------------
# HTML templates
# ---------------------------------------------------------------------------

CSS = """
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=Nunito+Sans:wght@400;500;600;700&display=swap');

:root {
  --bg: #f5f0e8;
  --forest: #2d5a3d;
  --terracotta: #c4603a;
  --sage: #8fa88b;
  --dark: #2a2a2a;
  --muted: #6b6b5e;
  --card-bg: #fffdf8;
  --card-border: #e0d8cf;
  --warm-shadow: rgba(44, 62, 45, 0.08);
  --font-head: 'Fraunces', serif;
  --font-body: 'Nunito Sans', sans-serif;
  --font-mono: 'DM Mono', monospace;
  --radius: 24px;
  --radius-sm: 16px;
  --radius-pill: 100px;
}

*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: var(--font-body);
  color: var(--dark);
  background-color: var(--bg);
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E");
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

a { color: var(--forest); text-decoration: none; transition: color 0.2s; }
a:hover { color: var(--terracotta); }

/* ── NAV ── */
.topnav {
  position: sticky; top: 0; z-index: 100;
  background: rgba(245, 240, 232, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--card-border);
  padding: 0 24px;
}

.nav-inner {
  max-width: 1120px;
  margin: 0 auto;
  display: flex; align-items: center; height: 64px; gap: 0;
}

.brand {
  display: flex; align-items: center; gap: 8px;
  margin-right: 48px;
  text-decoration: none; color: var(--dark);
}

.brand .lobster { font-size: 24px; }

.brand-text {
  font-family: var(--font-head);
  font-style: italic;
  font-weight: 600;
  font-size: 1.25rem;
  color: var(--dark);
}

.brand-text .claw { color: var(--forest); }

.nav-links {
  display: flex;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-pill);
  padding: 3px;
}

.nav-links a {
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 600;
  padding: 6px 20px;
  border-radius: var(--radius-pill);
  color: var(--muted);
  transition: all 0.3s ease;
}

.nav-links a:hover {
  color: var(--dark);
}

.nav-links a.active {
  background: var(--forest);
  color: #fff;
}

.nav-links a.active:hover { color: #fff; }

/* ── LAYOUT ── */
.container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.page-header {
  text-align: center;
  margin-bottom: 40px;
}

.page-title {
  font-family: var(--font-head);
  font-size: clamp(1.8rem, 3.5vw, 2.5rem);
  font-weight: 700;
  color: var(--dark);
  margin-bottom: 6px;
}

.page-subtitle {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--muted);
}

/* ── CARDS ── */
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 28px;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px var(--warm-shadow);
}

/* ── BADGES ── */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 14px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.badge-green { background: rgba(45, 90, 61, 0.1); color: var(--forest); }
.badge-yellow { background: rgba(196, 96, 58, 0.1); color: var(--terracotta); }
.badge-red { background: rgba(180, 50, 50, 0.1); color: #b43232; }
.badge-blue { background: rgba(143, 168, 139, 0.15); color: var(--forest); }
.badge-gray { background: rgba(107, 107, 94, 0.1); color: var(--muted); }

/* ── JOBS GRID ── */
.jobs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.job-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 28px;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.job-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px var(--warm-shadow);
}

.job-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}

.job-id {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--muted);
  background: rgba(45, 90, 61, 0.06);
  padding: 3px 10px;
  border-radius: 8px;
}

.job-body {
  font-size: 0.95rem;
  color: var(--muted);
  line-height: 1.6;
}

.job-body strong {
  color: var(--dark);
  font-family: var(--font-head);
  font-weight: 600;
}

.job-meta {
  display: flex; gap: 16px; margin-top: 16px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--muted);
}

.job-meta span { display: flex; align-items: center; gap: 5px; }

/* ── SHORTS GRID ── */
.job-section {
  margin-bottom: 32px;
}
.job-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--card-border);
}
.job-section-header h3 {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--heading);
  margin: 0;
}
.job-section-date {
  font-size: 0.85rem;
  color: var(--muted);
}
.shorts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.short-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.short-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px var(--warm-shadow);
}

.video-wrap {
  position: relative;
  background: #2a2a2a;
  overflow: hidden;
}

.video-wrap video {
  width: 100%;
  max-height: 400px;
  display: block;
}

.score-badge {
  position: absolute;
  top: 12px; right: 12px;
  font-family: var(--font-head);
  font-size: 1.5rem;
  font-weight: 700;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
  z-index: 2;
}

.score-high {
  background: rgba(45, 90, 61, 0.9);
  color: #fff;
}

.score-mid {
  background: rgba(196, 96, 58, 0.9);
  color: #fff;
}

.score-low {
  background: rgba(107, 107, 94, 0.8);
  color: #fff;
}

.short-info {
  padding: 20px 24px 24px;
}

.short-info .style-tag {
  display: inline-block;
  padding: 3px 12px;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(45, 90, 61, 0.08);
  color: var(--forest);
}

.short-info .reason {
  color: var(--muted);
  font-size: 0.92rem;
  margin-top: 10px;
  line-height: 1.6;
}

.short-info .meta {
  display: flex; gap: 16px; margin-top: 14px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
}

.short-info .meta span { display: flex; align-items: center; gap: 4px; }

.no-video {
  height: 180px;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, var(--bg) 0%, var(--card-bg) 100%);
  color: var(--muted);
  font-size: 0.9rem;
  font-family: var(--font-mono);
}

/* ── CREDITS ── */
.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
  margin-bottom: 36px;
}

.stat {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 32px 24px;
  text-align: center;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.stat:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px var(--warm-shadow);
}

.stat .value {
  font-family: var(--font-head);
  font-size: 3rem;
  font-weight: 700;
  color: var(--forest);
  line-height: 1.1;
}

.stat .label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 8px;
}

/* ── USAGE TABLE ── */
.usage-card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius);
  padding: 28px;
}

.usage-card h2 {
  font-family: var(--font-head);
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 20px;
  color: var(--dark);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th {
  text-align: left;
  padding: 10px 16px;
  border-bottom: 1px solid var(--card-border);
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 1px;
}

td {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(224, 216, 207, 0.5);
  color: var(--muted);
  font-size: 0.88rem;
}

td strong {
  color: var(--terracotta);
  font-weight: 700;
}

tr:hover td {
  background: rgba(45, 90, 61, 0.03);
}

td code {
  font-family: var(--font-mono);
  font-size: 0.82rem;
}

/* ── EMPTY STATES ── */
.empty-state {
  text-align: center;
  padding: 80px 24px;
}

.empty-state .emoji {
  font-size: 56px;
  margin-bottom: 16px;
  display: block;
}

.empty-state .msg {
  font-family: var(--font-head);
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--dark);
  margin-bottom: 8px;
}

.empty-state .hint {
  font-size: 0.92rem;
  color: var(--muted);
}

/* ── ERROR ── */
.error-msg {
  background: rgba(196, 96, 58, 0.08);
  border: 1px solid rgba(196, 96, 58, 0.2);
  border-radius: var(--radius-sm);
  padding: 16px 20px;
  color: var(--terracotta);
  font-size: 0.92rem;
}

/* ── RESPONSIVE ── */
@media (max-width: 768px) {
  .topnav { padding: 0 16px; }
  .nav-inner { gap: 0; }
  .brand { margin-right: 16px; }
  .brand-text { font-size: 1rem; }
  .container { padding: 24px 16px 64px; }
  .jobs-grid, .shorts-grid { grid-template-columns: 1fr; }
  .stat-cards { grid-template-columns: 1fr 1fr; }
  .page-title { font-size: 1.6rem; }
}

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--card-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--sage); }
"""

def _nav(active):
    def link(href, label, key):
        cls = ' class="active"' if active == key else ""
        return f'<a href="{href}"{cls}>{label}</a>'
    return f"""<nav class="topnav"><div class="nav-inner">
<a href="/" class="brand"><span class="lobster">🦞</span><span class="brand-text">Viral<span class="claw">Claw</span></span></a>
<div class="nav-links">{link("/","Jobs","jobs")}{link("/shorts","Shorts","shorts")}{link("/credits","Credits","credits")}</div>
</div></nav>"""

def _page(title, body, active="jobs", refresh=0):
    meta_refresh = f'<meta http-equiv="refresh" content="{refresh}">' if refresh else ""
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} — ViralClaw</title>{meta_refresh}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,600&family=Nunito+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>{CSS}</style></head>
<body>{_nav(active)}<div class="container">{body}</div></body></html>"""

def _badge(status):
    s = (status or "unknown").lower()
    cls = {"completed":"badge-green","done":"badge-green","processing":"badge-yellow","running":"badge-yellow",
           "failed":"badge-red","error":"badge-red","pending":"badge-blue","queued":"badge-blue"}.get(s,"badge-gray")
    return f'<span class="badge {cls}">{status}</span>'

def _fmt_date(d):
    if not d: return "—"
    try:
        dt = datetime.fromisoformat(d.replace("Z","+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M")
    except Exception:
        return d[:19] if len(d) > 19 else d

def _score_class(score):
    try:
        s = float(score)
        if s >= 70: return "score-high"
        if s >= 40: return "score-mid"
        return "score-low"
    except (ValueError, TypeError):
        return ""

# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

def _list_all_jobs():
    """Fetch all jobs via /api/v1/jobs endpoint (single request)."""
    return api_get("/api/v1/jobs?limit=100")


def page_jobs():
    # Single request to list all jobs
    jobs_data = _list_all_jobs()
    all_jobs = jobs_data.get("jobs", []) if "error" not in jobs_data else []

    # Also get shorts to count per job
    shorts_data = api_get("/api/v1/shorts?per_page=100")
    shorts = shorts_data.get("shorts", []) if "error" not in shorts_data else []
    shorts_by_job = {}
    for s in shorts:
        jid = str(s.get("job_id", ""))
        shorts_by_job.setdefault(jid, []).append(s)

    has_processing = False

    if not all_jobs:
        body = """<div class="empty-state">
<span class="emoji">🦞</span>
<div class="msg">No jobs yet — the lobster awaits!</div>
<div class="hint">Submit a video to get started with ViralClaw</div>
</div>"""
    else:
        cards = ""
        for j in all_jobs:
            jid = str(j.get("job_id", ""))
            status = j.get("status", "unknown")
            if status.lower() in ("processing", "queued", "pending"):
                has_processing = True

            job_shorts = shorts_by_job.get(jid, [])
            style = j.get("style", "—")
            created = _fmt_date(j.get("created_at"))
            n = len(job_shorts)

            if n > 0:
                detail = f"<strong>{n} short{'s' if n != 1 else ''}</strong> · {style}"
            elif status.lower() in ("processing", "queued"):
                detail = "<strong>⏳ Generating shorts...</strong>"
            elif status.lower() == "failed":
                detail = "<strong>❌ Failed</strong>"
            else:
                detail = f"<strong>{status}</strong>"

            cards += f"""<div class="job-card">
<div class="job-header"><span class="job-id">{jid}</span>{_badge(status)}</div>
<div class="job-body">{detail}</div>
<div class="job-meta"><span>📅 {created}</span></div>
</div>"""

        body = f"""<div class="page-header">
<div class="page-title">Jobs</div>
<div class="page-subtitle">{len(all_jobs)} job{'s' if len(all_jobs) != 1 else ''} tracked</div>
</div>
<div class="jobs-grid">{cards}</div>"""

    return _page("Jobs", body, "jobs", refresh=15 if has_processing else 0)


def page_shorts():
    data = api_get("/api/v1/shorts?per_page=100")
    if "error" in data:
        return _page("Shorts", f'<div class="error-msg">⚠ Error: {data["error"]}</div>', "shorts")
    shorts = data.get("shorts", [])
    if not shorts:
        return _page("Shorts", """<div class="empty-state">
<span class="emoji">🎬</span>
<div class="msg">No shorts generated yet</div>
<div class="hint">Your cinematic masterpieces will appear here</div>
</div>""", "shorts")

    # Group shorts by job_id
    by_job = {}
    for s in shorts:
        jid = str(s.get("job_id", "unknown"))
        by_job.setdefault(jid, []).append(s)

    sections = ""
    for jid, job_shorts in sorted(by_job.items(), key=lambda x: x[1][0].get("created_at", ""), reverse=True):
        # Sort shorts within job by score (descending)
        job_shorts.sort(key=lambda x: x.get("score", 0) or 0, reverse=True)
        first = job_shorts[0]
        job_created = _fmt_date(first.get("created_at"))
        style = first.get("style", "—")

        cards = ""
        for s in job_shorts:
            url = s.get("url", "")
            score = s.get("score", "—")
            reason = s.get("reason", "")
            dur = s.get("duration", "—")
            sc = _score_class(score)

            if url:
                video_tag = f"""<div class="video-wrap">
<video controls preload="metadata" src="{url}"></video>
<div class="score-badge {sc}">{score}</div>
</div>"""
            else:
                video_tag = f"""<div class="video-wrap">
<div class="no-video">📼 No video URL</div>
<div class="score-badge {sc}">{score}</div>
</div>"""

            cards += f"""<div class="short-card">{video_tag}
<div class="short-info">
<span class="style-tag">{style}</span>
<p class="reason">{reason}</p>
<div class="meta"><span>⏱ {dur}s</span><span>📅 {_fmt_date(s.get('created_at'))}</span></div>
</div></div>"""

        sections += f"""<div class="job-section">
<div class="job-section-header">
<h3>Job #{jid} · {style} · {len(job_shorts)} short{'s' if len(job_shorts) != 1 else ''}</h3>
<span class="job-section-date">📅 {job_created}</span>
</div>
<div class="shorts-grid">{cards}</div>
</div>"""

    body = f"""<div class="page-header">
<div class="page-title">Shorts</div>
<div class="page-subtitle">{len(shorts)} short{'s' if len(shorts) != 1 else ''} across {len(by_job)} job{'s' if len(by_job) != 1 else ''} · sorted by score</div>
</div>
{sections}"""
    return _page("Shorts", body, "shorts")


def page_credits():
    creds = api_get("/api/v1/credits")
    usage = api_get("/api/v1/usage")

    if "error" in creds:
        stats = f'<div class="error-msg">⚠ Error loading credits: {creds["error"]}</div>'
    else:
        stats = f"""<div class="stat-cards">
<div class="stat"><div class="value">{creds.get('credits','—')}</div><div class="label">Credits Remaining</div></div>
<div class="stat"><div class="value">{creds.get('plan','—')}</div><div class="label">Plan</div></div>
<div class="stat"><div class="value">{creds.get('rate_limit_per_minute','—')}</div><div class="label">Rate Limit / min</div></div>
</div>"""

    rows = ""
    if isinstance(usage, list):
        items = usage
    elif isinstance(usage, dict):
        items = usage.get("usage", usage.get("logs", []))
    else:
        items = []

    for u in items[:50]:
        rows += f'<tr><td>{_fmt_date(u.get("created_at", u.get("date","")))}</td><td>{u.get("action", u.get("type","—"))}</td><td><strong>{u.get("credits", u.get("amount","—"))}</strong></td><td>{u.get("description", u.get("details","—"))}</td></tr>'

    if rows:
        table = f"""<div class="usage-card"><h2>Usage History</h2><table>
<tr><th>Date</th><th>Action</th><th>Credits</th><th>Details</th></tr>{rows}</table></div>"""
    else:
        table = """<div class="usage-card"><h2>Usage History</h2>
<div class="empty-state" style="padding:40px">
<span class="emoji" style="font-size:40px">📊</span>
<div class="msg" style="font-size:1.1rem">No usage data yet</div>
<div class="hint">Your credit usage timeline will appear here</div>
</div></div>"""

    body = f"""<div class="page-header">
<div class="page-title">Credits</div>
<div class="page-subtitle">Account overview &amp; usage</div>
</div>
{stats}{table}"""
    return _page("Credits", body, "credits")

# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("", "/", "/jobs"):
            html = page_jobs()
        elif path == "/shorts":
            html = page_shorts()
        elif path == "/credits":
            html = page_credits()
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())

    def log_message(self, fmt, *args):
        pass  # quiet


def main():
    parser = argparse.ArgumentParser(description="ViralClaw Dashboard")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    if not API_KEY:
        print("⚠️  No API key found. Set VIRALCLAW_API_KEY or configure via: openclaw config set viralclaw.api_key YOUR_KEY")

    server = HTTPServer(("0.0.0.0", args.port), Handler)
    print(f"Dashboard running at http://localhost:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

if __name__ == "__main__":
    main()
