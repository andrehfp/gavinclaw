#!/usr/bin/env python3
import json, pathlib, datetime, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)
now = datetime.datetime.now()
ts = now.strftime("%Y-%m-%d_%H%M")

# try moldaspace analytics snapshot
analytics = None
try:
    p = subprocess.run(["python3", "/home/andreprado/.openclaw/workspace/scripts/moldaspace_analytics.py", "--json"], capture_output=True, text=True, timeout=90)
    analytics = json.loads(p.stdout)
except Exception:
    analytics = None

latest_baseline = sorted(REPORT_DIR.glob("baseline_*.json"))[-1] if list(REPORT_DIR.glob("baseline_*.json")) else None
latest_queue = sorted(REPORT_DIR.glob("publish_queue_*.json"))[-1] if list(REPORT_DIR.glob("publish_queue_*.json")) else None

summary = {
    "generated_at": now.isoformat(),
    "latest_baseline": str(latest_baseline) if latest_baseline else None,
    "latest_queue": str(latest_queue) if latest_queue else None,
    "analytics": analytics,
    "next_actions": [
        "Publicar 2 páginas BOFU com prova visual + CTA 5 free renders",
        "Revisar títulos/meta das páginas com maior impressão",
        "Checar canibalização antes de criar novas URLs"
    ]
}

out_json = REPORT_DIR / f"weekly_review_{ts}.json"
out_md = REPORT_DIR / f"weekly_review_{ts}.md"
out_json.write_text(json.dumps(summary, ensure_ascii=False, indent=2))

lines = [f"# SEO Weekly Review - {now.strftime('%Y-%m-%d %H:%M')}",""]
if analytics:
    rev = (((analytics.get('revenue') or {}).get('last_7_days') or {}).get('total_revenue'))
    signups = (((analytics.get('users') or {}).get('last_7_days') or {}).get('signups_7d'))
    lines += [f"- Revenue 7d: **{rev}**", f"- Signups 7d: **{signups}**",""]
lines.append("## Next actions")
for a in summary["next_actions"]:
    lines.append(f"- {a}")
out_md.write_text("\n".join(lines))

print(json.dumps({"ok": True, "action": "seo.weekly_review", "data": {"json": str(out_json), "md": str(out_md)}}))
