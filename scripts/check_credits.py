#!/usr/bin/env python3
"""
Check ViralClaw credit balance.
Usage: python3 check_credits.py
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


def _safe_http_error_message(code: int) -> str:
    return SAFE_HTTP_ERROR_MESSAGES.get(code, "Request failed. Try again or contact support.")


def main():
    parser = argparse.ArgumentParser(description="Check ViralClaw credit balance")
    parser.add_argument("--insecure", action="store_true", help="Allow non-HTTPS VIRALCLAW_API_URL (local dev only)")
    args = parser.parse_args()

    api_base = validate_api_base(API_BASE, insecure=args.insecure)

    global API_KEY
    if not API_KEY:
        config = _load_config(); API_KEY = config.get("api_key")

    if not API_KEY:
        print("❌ No API key configured!", file=sys.stderr)
        print("Set VIRALCLAW_API_KEY or run: openclaw config set viralclaw.api_key YOUR_KEY", file=sys.stderr)
        sys.exit(1)
    
    url = f"{api_base}/api/credits"
    headers = {"X-API-Key": API_KEY}
    
    request = urllib.request.Request(url, headers=headers)
    
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))
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
    
    credits = data.get("credits", 0)
    plan = data.get("plan", "free")
    monthly_limit = data.get("monthly_limit", 0)
    used_this_month = data.get("used_this_month", 0)
    
    print(f"💰 ViralClaw Credits")
    print(f"   Plan: {plan.upper()}")
    print(f"   Balance: {credits} credits")
    print(f"   Used this month: {used_this_month}/{monthly_limit}")
    
    # Visual bar
    if monthly_limit > 0:
        pct = (used_this_month / monthly_limit) * 100
        filled = int(pct / 5)
        bar = "█" * filled + "░" * (20 - filled)
        print(f"   [{bar}] {pct:.0f}%")
    
    # Estimate what you can do
    print(f"\n📹 You can process:")
    print(f"   • {credits} minutes of video")
    print(f"   • ~{credits} shorts (1 min each)")
    print(f"   • ~{credits // 3} shorts (3 min each)")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        sys.exit(1)
