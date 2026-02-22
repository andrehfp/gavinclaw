#!/usr/bin/env python3
"""Instagram posting via InstaCLI (Meta BYO).

Usage:
    python3 instagram_post.py --image /path/image.png --caption "..." --account pessoal
    python3 instagram_post.py --carousel img1.png img2.png --caption "..." --account maia
    python3 instagram_post.py --reel /path/video.mp4 --caption "..." --account pessoal
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SECRETS_DIR = Path.home() / ".openclaw" / ".secrets"
ACCOUNTS = {
    "pessoal": SECRETS_DIR / "instagram_credentials.json",     # @andrefprado
    "maia": SECRETS_DIR / "instagram_maia_api.json",           # @studio.maia.arch
}


def run_json(cmd: list[str]) -> dict:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        err = proc.stderr.strip() or proc.stdout.strip() or "unknown error"
        raise RuntimeError(err)

    out = proc.stdout.strip()
    if not out:
        return {"ok": False, "error": {"message": "empty response"}}

    try:
        return json.loads(out)
    except json.JSONDecodeError:
        raise RuntimeError(f"invalid JSON response: {out[:500]}")


def load_creds(account: str) -> dict:
    path = ACCOUNTS[account]
    with open(path) as f:
        return json.load(f)


def configure_instacli(creds: dict) -> None:
    cmd = [
        "instacli",
        "setup",
        "meta-token",
        "--ig-account-id",
        str(creds["ig_account_id"]),
        "--page-access-token",
        str(creds["page_access_token"]),
        "--ig-username",
        str(creds.get("ig_username", "")),
        "--json",
        "--quiet",
    ]
    resp = run_json(cmd)
    if not resp.get("ok", False):
        raise RuntimeError(resp.get("error", {}).get("message", "instacli setup failed"))


def publish_photo(path_or_url: str, caption: str, dry_run: bool = False) -> dict:
    cmd = [
        "instacli", "publish", "photo",
        "--file", path_or_url,
        "--caption", caption,
        "--json", "--quiet",
    ]
    if dry_run:
        cmd.append("--dry-run")
    return run_json(cmd)


def publish_video(path_or_url: str, caption: str, dry_run: bool = False) -> dict:
    cmd = [
        "instacli", "publish", "video",
        "--file", path_or_url,
        "--caption", caption,
        "--json", "--quiet",
    ]
    if dry_run:
        cmd.append("--dry-run")
    return run_json(cmd)


def publish_carousel(paths_or_urls: list[str], caption: str, dry_run: bool = False) -> dict:
    cmd = [
        "instacli", "publish", "carousel",
        "--files", *paths_or_urls,
        "--caption", caption,
        "--json", "--quiet",
    ]
    if dry_run:
        cmd.append("--dry-run")
    return run_json(cmd)


def main() -> None:
    parser = argparse.ArgumentParser(description="Post to Instagram via InstaCLI")
    parser.add_argument("--image", help="Image path or public URL")
    parser.add_argument("--carousel", nargs="+", help="Image paths/URLs for carousel")
    parser.add_argument("--reel", help="Video path or public URL")
    parser.add_argument("--caption", required=True, help="Post caption")
    parser.add_argument(
        "--account",
        default="pessoal",
        choices=["pessoal", "maia"],
        help="Account: pessoal (@andrefprado) or maia (@studio.maia.arch)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Validate without publishing")
    args = parser.parse_args()

    if not any([args.image, args.carousel, args.reel]):
        print("Error: provide --image, --carousel, or --reel")
        sys.exit(1)

    try:
        creds = load_creds(args.account)
        configure_instacli(creds)

        if args.reel:
            resp = publish_video(args.reel, args.caption, dry_run=args.dry_run)
        elif args.carousel:
            resp = publish_carousel(args.carousel, args.caption, dry_run=args.dry_run)
        else:
            resp = publish_photo(args.image, args.caption, dry_run=args.dry_run)

        if not resp.get("ok", False):
            err = resp.get("error", {}).get("message", "publish failed")
            raise RuntimeError(err)

        media_id = resp.get("data", {}).get("media_id", "unknown")
        username = creds.get("ig_username", "")

        print("✅ Dry-run OK!" if args.dry_run else "✅ Posted successfully!")
        print(f"Media ID: {media_id}")
        if username:
            print(f"Profile: https://instagram.com/{username}")

    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
