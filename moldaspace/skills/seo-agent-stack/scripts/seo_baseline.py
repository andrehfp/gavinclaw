#!/usr/bin/env python3
import json, subprocess, pathlib, datetime, os

ROOT = pathlib.Path(__file__).resolve().parents[1]
BIN_KEYWORDS = ROOT / "bin" / "seo-keywords"
SEEDS_FILE = ROOT / "config" / "seeds.txt"
REPORT_DIR = ROOT / "reports"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

now = datetime.datetime.now()
ts = now.strftime("%Y-%m-%d_%H%M")
out_json = REPORT_DIR / f"baseline_{ts}.json"
out_md = REPORT_DIR / f"baseline_{ts}.md"

seeds = [s.strip() for s in SEEDS_FILE.read_text().splitlines() if s.strip()]
all_items = []
errors = []

for seed in seeds:
    cmd = [str(BIN_KEYWORDS), "discover", "--seed", seed, "--lang", "en", "--country", "US", "--limit", "20", "--intent", "auto", "--json"]
    # fallback to dry-run when no creds
    if not os.getenv("KEYWORDS_EVERYWHERE_API_KEY"):
        cmd.append("--dry-run")
    p = subprocess.run(cmd, capture_output=True, text=True)
    try:
        data = json.loads((p.stdout or "").strip() or "{}")
    except Exception:
        data = {"ok": False, "error": {"code": "PARSE_ERROR", "message": p.stdout[-300:] if p.stdout else p.stderr[-300:]}}

    if data.get("ok"):
        items = data.get("data", {}).get("items", [])
        for it in items:
            it["seed"] = seed
        all_items.extend(items)
    else:
        errors.append({"seed": seed, "error": data.get("error")})

# rank simple
score_map = {"high": 3, "medium": 2, "low": 1}
intent_weight = {"bofu": 3, "mofu": 2, "tofu": 1}
for it in all_items:
    it["_score"] = score_map.get(it.get("priority"),1) * 10 + intent_weight.get(it.get("intent"),1)

all_items.sort(key=lambda x: (x.get("_score",0), (x.get("volume") or 0)), reverse=True)
shortlist = all_items[:20]

payload = {
    "generated_at": now.isoformat(),
    "total_seeds": len(seeds),
    "total_items": len(all_items),
    "shortlist": shortlist,
    "errors": errors,
    "used_dry_run": not bool(os.getenv("KEYWORDS_EVERYWHERE_API_KEY")),
}
out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2))

lines = []
lines.append(f"# SEO Baseline - {now.strftime('%Y-%m-%d %H:%M')}")
lines.append("")
lines.append(f"- Seeds: **{len(seeds)}**")
lines.append(f"- Keywords coletadas: **{len(all_items)}**")
lines.append(f"- Dry-run: **{'sim' if payload['used_dry_run'] else 'não'}**")
lines.append(f"- Erros: **{len(errors)}**")
lines.append("")
lines.append("## Top 10 (prioridade)")
for i, it in enumerate(shortlist[:10], 1):
    lines.append(f"{i}. `{it.get('keyword','')}` | intent={it.get('intent')} | priority={it.get('priority')} | volume={it.get('volume')}")

out_md.write_text("\n".join(lines))
print(json.dumps({"ok": True, "action": "seo.baseline", "data": {"json": str(out_json), "md": str(out_md), "top": shortlist[:10], "errors": len(errors), "dry_run": payload['used_dry_run']}}, ensure_ascii=False))
