#!/usr/bin/env python3
"""Generate the Spark Intelligence Observatory in Obsidian.

Usage:
    python scripts/generate_observatory.py [--force] [--no-canvas] [--verbose]
"""

import argparse
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def main():
    parser = argparse.ArgumentParser(description="Generate Spark Intelligence Observatory")
    parser.add_argument("--force", action="store_true", help="Ignore cooldown and disabled state")
    parser.add_argument("--no-canvas", action="store_true", help="Skip canvas generation")
    parser.add_argument("--verbose", "-v", action="store_true", help="Print progress details")
    args = parser.parse_args()

    from lib.observatory import generate_observatory
    from lib.observatory.config import load_config

    cfg = load_config()
    if args.verbose:
        print(f"Observatory config:")
        print(f"  enabled: {cfg.enabled}")
        print(f"  vault_dir: {cfg.vault_dir}")
        print(f"  generate_canvas: {cfg.generate_canvas}")
        print(f"  max_recent_items: {cfg.max_recent_items}")
        print()

    if args.no_canvas:
        cfg.generate_canvas = False

    result = generate_observatory(force=args.force, verbose=args.verbose)

    if result.get("skipped"):
        print(f"Skipped: {result.get('reason', 'unknown')}")
        print("Use --force to generate anyway.")
        return

    print(f"Observatory generated:")
    print(f"  Files written: {result['files_written']}")
    print(f"  Elapsed: {result['elapsed_ms']:.0f}ms")
    print(f"  Vault: {result['vault_dir']}")
    print(f"\nOpen _observatory/flow.md in Obsidian to explore the intelligence flow.")


if __name__ == "__main__":
    main()
