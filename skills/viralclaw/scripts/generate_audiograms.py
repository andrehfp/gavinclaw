#!/usr/bin/env python3
"""Generate audiograms from a video using ViralClaw API."""

import argparse, json, os, sys, time, urllib.request, urllib.error

API_BASE = os.environ.get("VIRALCLAW_API_URL", "https://api.viral-claw.com")
API_KEY = os.environ.get("VIRALCLAW_API_KEY")

def _api_key():
    key = API_KEY
    if not key:
        kf = os.path.expanduser("~/.openclaw/.secrets/viralclaw_api_key")
        if os.path.exists(kf): key = open(kf).read().strip()
    if not key: print("ERROR: No API key.", file=sys.stderr); sys.exit(1)
    return key

def _request(method, path, data=None):
    url = f"{API_BASE}{path}"
    headers = {"X-API-Key": _api_key(), "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp: return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"ERROR: HTTP {e.code}: {e.read().decode()}", file=sys.stderr); sys.exit(1)

def _poll(job_id, timeout=300):
    start = time.time()
    while time.time() - start < timeout:
        r = _request("GET", f"/api/v1/job/{job_id}")
        s = r.get("status", "unknown")
        if s == "completed": return r
        if s in ("failed", "error"): print(f"ERROR: {s}: {r.get('error')}", file=sys.stderr); sys.exit(1)
        print(f"  {s}...", file=sys.stderr); time.sleep(5)
    print("ERROR: Timeout", file=sys.stderr); sys.exit(1)

def main():
    p = argparse.ArgumentParser(description="Generate audiograms from video")
    p.add_argument("video_url")
    p.add_argument("--count", type=int, default=3)
    p.add_argument("--style", default="bars", choices=["waveform", "bars", "circle"])
    p.add_argument("--format", default="both", choices=["square", "vertical", "both"])
    p.add_argument("--language", default=None)
    p.add_argument("--wait", action="store_true")
    p.add_argument("--json", action="store_true")
    a = p.parse_args()

    payload = {"video_url": a.video_url, "count": a.count, "style": a.style, "format": a.format}
    if a.language: payload["language"] = a.language

    print(f"🎙️ Generating audiograms from: {a.video_url}", file=sys.stderr)
    r = _request("POST", "/api/v1/generate-audiograms", payload)
    job_id = r.get("job_id")
    if not job_id: print(f"ERROR: {r}", file=sys.stderr); sys.exit(1)
    print(f"   Job: {job_id}", file=sys.stderr)

    if a.wait: r = _poll(job_id); print("✅ Done!", file=sys.stderr)
    print(json.dumps(r, indent=2))

if __name__ == "__main__": main()
