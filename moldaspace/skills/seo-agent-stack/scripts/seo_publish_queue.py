#!/usr/bin/env python3
import json, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

baseline_files = sorted(REPORT_DIR.glob("baseline_*.json"))
if not baseline_files:
    print(json.dumps({"ok": False, "error": {"code": "MISSING_BASELINE", "message": "Run seo_baseline first"}}))
    raise SystemExit(1)

latest = baseline_files[-1]
data = json.loads(latest.read_text())
items = data.get("shortlist", [])

bofu = [x for x in items if x.get("intent") == "bofu"]
selected = bofu[:8] if len(bofu) >= 8 else (bofu + [x for x in items if x.get("intent") != "bofu"])[:8]

now = datetime.datetime.now()
ts = now.strftime("%Y-%m-%d_%H%M")
out_json = REPORT_DIR / f"publish_queue_{ts}.json"
out_md = REPORT_DIR / f"publish_queue_{ts}.md"

slug = lambda k: k.lower().replace("/"," ").replace("?"," ").replace("  "," ").strip().replace(" ","-")
queue = []
for it in selected:
    kw = it.get("keyword", "")
    queue.append({
        "keyword": kw,
        "slug": f"/{slug(kw)}",
        "intent": it.get("intent"),
        "priority": it.get("priority"),
        "cta": "5 free renders",
        "status": "ready_for_draft",
    })

out_json.write_text(json.dumps({"generated_at": now.isoformat(), "from": str(latest), "queue": queue}, ensure_ascii=False, indent=2))

lines = [f"# SEO Publish Queue - {now.strftime('%Y-%m-%d %H:%M')}", "", f"Fonte: `{latest.name}`", "", "## Próximas páginas (8)"]
for i, q in enumerate(queue, 1):
    lines.append(f"{i}. `{q['slug']}` | kw=`{q['keyword']}` | {q['intent']} | {q['priority']}")
out_md.write_text("\n".join(lines))

print(json.dumps({"ok": True, "action": "seo.publish_queue", "data": {"json": str(out_json), "md": str(out_md), "count": len(queue)}}))
