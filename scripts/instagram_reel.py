#!/usr/bin/env python3
"""Publish an Instagram Reel via InstaCLI.

Compatibility modes:
    python3 instagram_reel.py <video_path_or_url> --caption "text" --account maia
    python3 instagram_reel.py <video_path_or_url> "text" maia
"""

import argparse
import subprocess
import sys


def parse_args():
    parser = argparse.ArgumentParser(description="Publish Reel via InstaCLI")
    parser.add_argument("video_url", help="Local path or public URL")
    parser.add_argument("legacy_caption", nargs="?", default=None,
                        help="Legacy positional caption")
    parser.add_argument("legacy_account", nargs="?", default=None,
                        choices=["pessoal", "maia"],
                        help="Legacy positional account")

    parser.add_argument("--caption", default=None, help="Caption text")
    parser.add_argument("--account", default="pessoal", choices=["pessoal", "maia"],
                        help="Account (default: pessoal)")
    parser.add_argument("--caption-file", dest="caption_file", default=None,
                        help="Read caption from file")
    parser.add_argument("--dry-run", action="store_true", help="Validate without publishing")

    args = parser.parse_args()

    # Resolve caption precedence: --caption-file > --caption > legacy positional
    if args.caption_file:
        with open(args.caption_file) as f:
            args.caption = f.read().strip()
    elif not args.caption and args.legacy_caption:
        args.caption = args.legacy_caption

    # Legacy positional account fallback
    if args.legacy_account and args.account == "pessoal":
        args.account = args.legacy_account

    if not args.caption:
        parser.error("Caption required (use --caption or legacy positional caption)")

    return args


def main():
    args = parse_args()

    cmd = [
        "python3",
        "/home/andreprado/.openclaw/workspace/scripts/instagram_post.py",
        "--reel",
        args.video_url,
        "--caption",
        args.caption,
        "--account",
        args.account,
    ]

    if args.dry_run:
        cmd.append("--dry-run")

    proc = subprocess.run(cmd)
    sys.exit(proc.returncode)


if __name__ == "__main__":
    main()
