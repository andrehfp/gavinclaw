#!/usr/bin/env python3
"""
Repurpose a video into multiple content formats using ViralClaw API.
Usage: python3 repurpose.py VIDEO_URL [--formats shorts,carousels,...] [--wait] [--json]
"""

import argparse
import json
import os
import sys
import time
import urllib.request
import urllib.error

DEFAULT_API_BASE = "https://api.viral-claw.com"
API_BASE = os.environ.get("VIRALCLAW_API_URL", DEFAULT_API_BASE)
API_KEY = os.environ.get("VIRALCLAW_API_KEY")

ALL_FORMATS = ["shorts", "carousels", "threads", "quote_cards", "audiograms"]


def _api_key():
    key = API_KEY
    if not key:
        key_file = os.path.expanduser("~/.openclaw/.secrets/viralclaw_api_key")
        if os.path.exists(key_file):
            key = open(key_file).read().strip()
    if not key:
        print("ERROR: No API key. Set VIRALCLAW_API_KEY or run: openclaw config set viralclaw.api_key YOUR_KEY", file=sys.stderr)
        sys.exit(1)
    return key


def _request(method, path, data=None):
    url = f"{API_BASE}{path}"
    headers = {"X-API-Key": _api_key(), "Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        print(f"ERROR: HTTP {e.code}: {error_body}", file=sys.stderr)
        sys.exit(1)


def _poll_job(job_id, timeout=600):
    start = time.time()
    while time.time() - start < timeout:
        result = _request("GET", f"/api/v1/job/{job_id}")
        status = result.get("status", "unknown")
        if status == "completed":
            return result
        elif status in ("failed", "error"):
            print(f"ERROR: Job {status}: {result.get('error', 'unknown')}", file=sys.stderr)
            sys.exit(1)
        progress = result.get("progress", "")
        print(f"  Status: {status} {f'({progress})' if progress else ''}", file=sys.stderr)
        time.sleep(5)
    print(f"ERROR: Timeout after {timeout}s", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Repurpose video into multiple formats")
    parser.add_argument("video_url", help="Video URL or path")
    parser.add_argument("--formats", default=",".join(ALL_FORMATS), help=f"Comma-separated formats (default: all)")
    parser.add_argument("--shorts-count", type=int, default=5)
    parser.add_argument("--shorts-style", default="hormozi")
    parser.add_argument("--carousel-slides", type=int, default=7)
    parser.add_argument("--carousel-style", default="corporate")
    parser.add_argument("--thread-platform", default="both")
    parser.add_argument("--thread-tone", default="casual")
    parser.add_argument("--quote-cards-count", type=int, default=3)
    parser.add_argument("--quote-cards-style", default="gradient")
    parser.add_argument("--audiogram-count", type=int, default=3)
    parser.add_argument("--audiogram-style", default="bars")
    parser.add_argument("--audiogram-format", default="both")
    parser.add_argument("--language", default=None)
    parser.add_argument("--wait", action="store_true", help="Wait for completion")
    parser.add_argument("--json", action="store_true", help="JSON output")
    parser.add_argument("--timeout", type=int, default=600, help="Poll timeout in seconds")
    args = parser.parse_args()

    payload = {
        "video_url": args.video_url,
        "formats": args.formats.split(","),
        "shorts_count": args.shorts_count,
        "shorts_style": args.shorts_style,
        "carousel_slide_count": args.carousel_slides,
        "carousel_style": args.carousel_style,
        "thread_platform": args.thread_platform,
        "thread_tone": args.thread_tone,
        "quote_cards_count": args.quote_cards_count,
        "quote_cards_style": args.quote_cards_style,
        "audiogram_count": args.audiogram_count,
        "audiogram_style": args.audiogram_style,
        "audiogram_format": args.audiogram_format,
    }
    if args.language:
        payload["language"] = args.language

    print(f"🚀 Submitting repurpose job for: {args.video_url}", file=sys.stderr)
    print(f"   Formats: {args.formats}", file=sys.stderr)

    result = _request("POST", "/api/v1/repurpose", payload)
    job_id = result.get("job_id")

    if not job_id:
        print(f"ERROR: No job_id in response: {result}", file=sys.stderr)
        sys.exit(1)

    print(f"   Job ID: {job_id}", file=sys.stderr)

    if args.wait:
        print("⏳ Waiting for completion...", file=sys.stderr)
        result = _poll_job(job_id, timeout=args.timeout)
        print("✅ Done!", file=sys.stderr)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
