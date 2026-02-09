#!/usr/bin/env python3
"""
Generate viral shorts from a long video using ViralClaw API.
Usage: python3 generate_shorts.py VIDEO_URL [--style STYLE] [--count N] [--language LANG] [--wait]
"""

import argparse
import json
import logging
import os
import stat
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import urlparse

logging.basicConfig(level=logging.WARNING, format="WARNING: %(message)s")
LOGGER = logging.getLogger(__name__)

DEFAULT_API_BASE = "https://api.viral-claw.com"
API_BASE = os.environ.get("VIRALCLAW_API_URL", DEFAULT_API_BASE)
API_KEY = os.environ.get("VIRALCLAW_API_KEY")

STYLES = ["hormozi", "mrbeast", "tiktok", "minimal", "karaoke"]
SAFE_HTTP_ERROR_MESSAGES = {
    400: "Bad request. Verify input parameters and try again.",
    401: "Authentication failed. Check your API key.",
    402: "Insufficient credits. Top up your account.",
    403: "Access denied.",
    404: "API endpoint not found.",
    408: "Request timed out. Try again.",
    413: "Video too large. Try a shorter video.",
    429: "Rate limit exceeded. Try again later.",
    500: "Server error. Try again later.",
    502: "Upstream service error. Try again later.",
    503: "Service unavailable. Try again later.",
    504: "Gateway timeout. Try again later.",
}


def _warn_if_permissions_open(path: str):
    """Warn if config file permissions are too open."""
    try:
        mode = stat.S_IMODE(os.stat(path).st_mode)
    except (FileNotFoundError, PermissionError, OSError):
        return
    if mode & 0o077:
        LOGGER.warning("Config file '%s' is too permissive (%o). Recommended: 600.", path, mode)


def _load_config():
    """Load viralclaw config from OpenClaw config file."""
    config_paths = [
        os.path.expanduser("~/.openclaw/config.json"),
        os.path.expanduser("~/.config/openclaw/config.json"),
    ]
    for path in config_paths:
        if os.path.exists(path):
            _warn_if_permissions_open(path)
            try:
                with open(path, encoding="utf-8") as f:
                    config = json.load(f)
                    return config.get("viralclaw", {})
            except (FileNotFoundError, PermissionError, json.JSONDecodeError, OSError):
                continue
    return {}


def validate_api_base(api_base: str, insecure: bool = False) -> str:
    """Ensure API URL is valid."""
    parsed = urlparse(api_base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("VIRALCLAW_API_URL must be an absolute URL")
    # Allow http for localhost
    if parsed.scheme == "http" and parsed.hostname not in ("localhost", "127.0.0.1"):
        if not insecure:
            raise ValueError("VIRALCLAW_API_URL must use https:// (use --insecure for http)")
    return api_base.rstrip("/")


def validate_public_url(value: str, field_name: str) -> str:
    """Validate URL format for user-provided URLs."""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_name} must be a valid http(s) URL")
    return value


def validate_count(value: int) -> int:
    """Enforce allowed range for count."""
    if not 1 <= value <= 10:
        raise ValueError("count must be between 1 and 10")
    return value


def _safe_http_error_message(code: int) -> str:
    return SAFE_HTTP_ERROR_MESSAGES.get(code, "Request failed. Try again or contact support.")


def api_request_form(api_base: str, endpoint: str, data: dict) -> dict:
    """Make form-data API request to ViralClaw."""
    url = f"{api_base}{endpoint}"
    
    # Build multipart form data
    boundary = "----ViralClawBoundary"
    body_parts = []
    for key, value in data.items():
        if value is not None:
            body_parts.append(f"--{boundary}")
            body_parts.append(f'Content-Disposition: form-data; name="{key}"')
            body_parts.append("")
            body_parts.append(str(value))
    body_parts.append(f"--{boundary}--")
    body_parts.append("")
    body = "\r\n".join(body_parts).encode("utf-8")
    
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"❌ API Error ({e.code}): {_safe_http_error_message(e.code)}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        print("❌ Connection timed out", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("❌ Invalid response received from API", file=sys.stderr)
        sys.exit(1)


def api_request_get(api_base: str, endpoint: str) -> dict:
    """Make GET request to ViralClaw API."""
    url = f"{api_base}{endpoint}"
    headers = {"X-API-Key": API_KEY}
    
    request = urllib.request.Request(url, headers=headers, method="GET")
    
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"❌ API Error ({e.code}): {_safe_http_error_message(e.code)}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ Connection error: {e.reason}", file=sys.stderr)
        sys.exit(1)
    except TimeoutError:
        print("❌ Connection timed out", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("❌ Invalid response received from API", file=sys.stderr)
        sys.exit(1)


def generate_shorts(api_base: str, video_url: str, style: str, count: int, language: str = None) -> dict:
    """Submit video for shorts generation."""
    data = {
        "video_url": video_url,
        "style": style,
        "count": count,
    }
    if language:
        data["language"] = language
    
    return api_request_form(api_base, "/api/v1/generate-shorts", data)


def get_job_status(api_base: str, job_id: int) -> dict:
    """Get job status."""
    return api_request_get(api_base, f"/api/v1/jobs/{job_id}")


def wait_for_job(api_base: str, job_id: int, timeout: int = 600) -> dict:
    """Poll job until done or timeout."""
    start = time.time()
    last_status = None
    
    while time.time() - start < timeout:
        status = get_job_status(api_base, job_id)
        current = status.get("status")
        
        if current != last_status:
            print(f"📊 Status: {current}", file=sys.stderr)
            last_status = current
        
        if current == "done":
            return status
        elif current == "failed":
            error = status.get("error", "Unknown error")
            print(f"❌ Job failed: {error}", file=sys.stderr)
            sys.exit(1)
        
        # Progress indicator
        print(".", end="", flush=True, file=sys.stderr)
        time.sleep(5)
    
    print(f"\n⏱️ Timeout after {timeout}s. Job still processing.", file=sys.stderr)
    print(f"Check status with: curl {api_base}/api/v1/jobs/{job_id}", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Generate viral shorts from a video")
    parser.add_argument("video_url", help="URL of the video (YouTube, direct link, etc.)")
    parser.add_argument("--style", "-s", default="hormozi", choices=STYLES, help="Caption style")
    parser.add_argument("--count", "-n", type=int, default=3, help="Number of shorts to generate (1-10)")
    parser.add_argument("--language", "-l", default="pt", help="Language for transcription")
    parser.add_argument("--wait", "-w", action="store_true", help="Wait for job to complete")
    parser.add_argument("--timeout", "-t", type=int, default=600, help="Wait timeout in seconds")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--insecure", action="store_true", help="Allow non-HTTPS API URL")
    
    args = parser.parse_args()
    
    # Load config from OpenClaw or env vars
    config = _load_config()
    
    global API_KEY, API_BASE
    if not API_KEY:
        API_KEY = config.get("api_key")
    if API_BASE == DEFAULT_API_BASE and config.get("api_url"):
        API_BASE = config.get("api_url")
    
    api_base = validate_api_base(API_BASE, insecure=args.insecure)
    video_url = validate_public_url(args.video_url, "video_url")
    count = validate_count(args.count)
    
    if not API_KEY:
        print("❌ No API key configured!", file=sys.stderr)
        print("Set VIRALCLAW_API_KEY env var or run: openclaw config set viralclaw.api_key YOUR_KEY", file=sys.stderr)
        sys.exit(1)
    
    # Submit job
    print(f"🦞 Generating {count} shorts with style '{args.style}'...", file=sys.stderr)
    result = generate_shorts(api_base, video_url, args.style, count, args.language)
    
    job_id = result.get("job_id")
    if not job_id:
        print(f"❌ Failed to create job: {result}", file=sys.stderr)
        sys.exit(1)
    
    print(f"✅ Job created: {job_id}", file=sys.stderr)
    
    if args.wait:
        print(f"⏳ Waiting for completion (timeout: {args.timeout}s)...", file=sys.stderr)
        final = wait_for_job(api_base, job_id, args.timeout)
        
        if args.json:
            print(json.dumps(final, indent=2))
        else:
            print(f"\n✅ Done!", file=sys.stderr)
            shorts = final.get("result", {}).get("shorts", [])
            if shorts:
                print(f"\n🎬 Generated {len(shorts)} shorts:", file=sys.stderr)
                for short in shorts:
                    idx = short.get("index", "?")
                    path = short.get("output_path", "?")
                    duration = short.get("duration", 0)
                    score = short.get("score", 0)
                    reason = short.get("reason", "")[:50]
                    print(f"  [{idx}] {path}", file=sys.stderr)
                    print(f"      Duration: {duration:.1f}s | Score: {score:.2f}", file=sys.stderr)
                    print(f"      Reason: {reason}...", file=sys.stderr)
            else:
                print(f"Output: {final.get('output_url', 'N/A')}", file=sys.stderr)
    else:
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"\n📋 Check status:", file=sys.stderr)
            print(f"   curl {api_base}/api/v1/jobs/{job_id} -H 'X-API-Key: $VIRALCLAW_API_KEY'", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n⚠️ Interrupted", file=sys.stderr)
        sys.exit(130)
