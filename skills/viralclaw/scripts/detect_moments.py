#!/usr/bin/env python3
"""
Detect viral moments in a video using ViralClaw API.
Usage: python3 detect_moments.py VIDEO_URL [--count N]
"""

import argparse
import json
import logging
import os
import stat
import sys
import urllib.request
import urllib.error
from urllib.parse import urlparse

logging.basicConfig(level=logging.WARNING, format="WARNING: %(message)s")
LOGGER = logging.getLogger(__name__)

DEFAULT_API_BASE = "https://api.viral-claw.com"
API_BASE = os.environ.get("VIRALCLAW_API_URL", DEFAULT_API_BASE)
API_KEY = os.environ.get("VIRALCLAW_API_KEY")
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
    """Try loading API key from OpenClaw config."""
    for path in ["~/.openclaw/config.json", "~/.config/openclaw/config.json"]:
        path = os.path.expanduser(path)
        if os.path.exists(path):
            _warn_if_permissions_open(path)
            try:
                with open(path, encoding="utf-8") as f:
                    api_key = json.load(f).get("viralclaw", {}).get("api_key")
                    if api_key:
                        return api_key
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


def validate_count(value: int) -> int:
    """Enforce allowed range for moment count."""
    if not 1 <= value <= 20:
        raise ValueError("count must be between 1 and 20")
    return value


def _safe_http_error_message(code: int) -> str:
    return SAFE_HTTP_ERROR_MESSAGES.get(code, "Request failed. Try again or contact support.")


def api_request(api_base: str, endpoint: str, data: dict = None) -> dict:
    """Make API request."""
    url = f"{api_base}{endpoint}"
    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}
    
    request = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data else None,
        headers=headers,
        method="POST" if data else "GET"
    )
    
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


def format_time(seconds: float) -> str:
    """Format seconds as MM:SS."""
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def main():
    parser = argparse.ArgumentParser(description="Detect viral moments in a video")
    parser.add_argument("video_url", help="URL of the video to analyze")
    parser.add_argument("--count", "-n", type=int, default=5, help="Number of moments to find")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--insecure", action="store_true", help="Allow non-HTTPS VIRALCLAW_API_URL (local dev only)")
    
    args = parser.parse_args()

    api_base = validate_api_base(API_BASE, insecure=args.insecure)
    video_url = validate_public_url(args.video_url, "video_url")
    count = validate_count(args.count)

    global API_KEY
    if not API_KEY:
        config = _load_config(); API_KEY = config.get("api_key")
    
    if not API_KEY:
        print("❌ No API key! Set VIRALCLAW_API_KEY or openclaw config set viralclaw.api_key", file=sys.stderr)
        sys.exit(1)
    
    print(f"🔍 Analyzing video for viral moments...", file=sys.stderr)
    
    result = api_request(api_base, "/api/detect-moments", {
        "video_url": video_url,
        "count": count
    })
    
    if args.json:
        print(json.dumps(result, indent=2))
        return
    
    moments = result.get("moments", [])
    
    if not moments:
        print("❌ No viral moments found")
        return
    
    print(f"\n🎯 Found {len(moments)} viral moments:\n")
    
    for i, m in enumerate(moments, 1):
        start = format_time(m["start"])
        end = format_time(m["end"])
        duration = m["end"] - m["start"]
        score = m.get("score", 0) * 100
        reason = m.get("reason", "")
        
        print(f"  {i}. [{start} → {end}] ({duration:.0f}s) - Score: {score:.0f}%")
        if reason:
            print(f"     💡 {reason}")
        print()
    
    # Output timestamps for piping
    print("\n📋 Timestamps (for ffmpeg):")
    for m in moments:
        print(f"  -ss {m['start']:.1f} -to {m['end']:.1f}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        sys.exit(1)
