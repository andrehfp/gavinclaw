#!/usr/bin/env python3
"""Quick Scrapling probe.

Usage:
  python scripts/scrapling_probe.py https://example.com
"""

from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: scrapling_probe.py <url>")
        return 2

    url = sys.argv[1]

    try:
        from scrapling.fetchers import Fetcher
    except Exception as exc:  # pragma: no cover
        print("Scrapling not installed. Install with: pip install scrapling")
        print(f"Import error: {exc}")
        return 1

    try:
        page = Fetcher.get(url)
        title = page.css("title::text").get() if page else None
        h1 = page.css("h1::text").get() if page else None
        print(f"URL: {url}")
        print(f"TITLE: {title or '<none>'}")
        print(f"H1: {h1 or '<none>'}")
        return 0
    except Exception as exc:
        print(f"Probe failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
