#!/usr/bin/env python3
"""
Add viral-style captions to a video using ViralClaw API.
Usage: python3 add_captions.py VIDEO_URL [--style STYLE] [--language LANG] [--wait]
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
    403: "Access denied.",
    404: "API endpoint not found.",
    408: "Request timed out. Try again.",
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
    except (FileNotFoundError, PermissionError, OSError) as exc:
        LOGGER.warning("Could not inspect permissions for config '%s': %s", path, exc)
        return

    if mode & 0o077:
        LOGGER.warning(
            "Config file '%s' is too permissive (%o). Recommended: 600.",
            path,
            mode,
        )


def _load_config():
    """Try to load API key from OpenClaw config."""
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
            except FileNotFoundError:
                continue
            except PermissionError as exc:
                LOGGER.warning("Cannot read config '%s': %s", path, exc)
            except json.JSONDecodeError as exc:
                LOGGER.warning("Invalid JSON in config '%s': %s", path, exc)
            except OSError as exc:
                LOGGER.warning("Could not read config '%s': %s", path, exc)
    return None


def validate_api_base(api_base: str, insecure: bool = False) -> str:
    """Ensure API URL is secure unless explicitly allowed."""
    parsed = urlparse(api_base)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError("VIRALCLAW_API_URL must be an absolute URL (e.g. https://api.viralclaw.io)")
    if parsed.scheme != "https" and not insecure:
        raise ValueError("VIRALCLAW_API_URL must start with https:// (use --insecure to allow http://)")
    if parsed.scheme not in {"https", "http"}:
        raise ValueError("VIRALCLAW_API_URL scheme must be https:// or http://")
    return api_base.rstrip("/")


def validate_public_url(value: str, field_name: str) -> str:
    """Validate URL format for user-provided URLs."""
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"{field_name} must be a valid http(s) URL")
    return value


def _safe_http_error_message(code: int) -> str:
    return SAFE_HTTP_ERROR_MESSAGES.get(code, "Request failed. Try again or contact support.")


def api_request(api_base: str, endpoint: str, data: dict = None, method: str = "GET") -> dict:
    """Make API request to ViralClaw."""
    url = f"{api_base}{endpoint}"
    headers = {
        "X-API-Key": API_KEY,
        "Content-Type": "application/json",
    }
    
    if data:
        request = urllib.request.Request(
            url,
            data=json.dumps(data).encode(),
            headers=headers,
            method=method
        )
    else:
        request = urllib.request.Request(url, headers=headers, method=method)
    
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


def add_captions(
    api_base: str,
    video_url: str,
    style: str = "hormozi",
    language: str = "pt",
    webhook_url: str = None,
) -> dict:
    """Submit video for captioning."""
    data = {
        "video_url": video_url,
        "style": style,
        "language": language,
    }
    if webhook_url:
        data["webhook_url"] = webhook_url
    
    return api_request(api_base, "/api/add-captions", data, method="POST")


def get_job_status(api_base: str, job_id: str) -> dict:
    """Get job status."""
    return api_request(api_base, f"/api/jobs/{job_id}")


def wait_for_job(api_base: str, job_id: str, timeout: int = 300) -> dict:
    """Poll job until done or timeout."""
    start = time.time()
    while time.time() - start < timeout:
        status = get_job_status(api_base, job_id)
        
        if status["status"] == "done":
            return status
        elif status["status"] == "failed":
            print("❌ Job failed. Check API logs for details.", file=sys.stderr)
            sys.exit(1)
        
        # Progress indicator
        print(f"⏳ Status: {status['status']}...", end="\r")
        time.sleep(3)
    
    print(f"❌ Timeout after {timeout}s", file=sys.stderr)
    sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Add viral captions to a video")
    parser.add_argument("video_url", help="URL of the video to process")
    parser.add_argument("--style", "-s", choices=STYLES, default="hormozi", help="Caption style")
    parser.add_argument("--language", "-l", default="pt", help="Language code (pt, en, es, etc)")
    parser.add_argument("--webhook", "-w", help="Webhook URL for completion callback")
    parser.add_argument("--wait", action="store_true", help="Wait for job to complete")
    parser.add_argument("--timeout", "-t", type=int, default=300, help="Wait timeout in seconds")
    parser.add_argument("--insecure", action="store_true", help="Allow non-HTTPS VIRALCLAW_API_URL (local dev only)")
    
    args = parser.parse_args()

    api_base = validate_api_base(API_BASE, insecure=args.insecure)
    video_url = validate_public_url(args.video_url, "video_url")
    webhook_url = validate_public_url(args.webhook, "webhook_url") if args.webhook else None

    global API_KEY
    if not API_KEY:
        config = _load_config(); API_KEY = config.get("api_key")

    if not API_KEY:
        print("❌ No API key configured!", file=sys.stderr)
        print("Set VIRALCLAW_API_KEY env var or run: openclaw config set viralclaw.api_key YOUR_KEY", file=sys.stderr)
        sys.exit(1)
    
    # Submit job
    print(f"🎬 Submitting video with style '{args.style}'...")
    result = add_captions(api_base, video_url, args.style, args.language, webhook_url)
    
    job_id = result["job_id"]
    credits = result.get("credits_required", "?")
    
    print(f"✅ Job queued: {job_id}")
    print(f"💰 Credits required: {credits}")
    
    if args.wait:
        print(f"⏳ Waiting for completion (timeout: {args.timeout}s)...")
        final = wait_for_job(api_base, job_id, args.timeout)
        print(f"\n✅ Done!")
        print(f"📹 Result: {final['result_url']}")
        print(f"💰 Credits used: {final.get('credits_used', '?')}")
        
        # Output just the URL for piping
        print(f"\n{final['result_url']}")
    else:
        print(f"\n💡 Check status: python3 {__file__} --status {job_id}")
        print(f"   Or use webhook for async notification")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        sys.exit(1)
