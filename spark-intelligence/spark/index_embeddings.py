"""Backfill semantic embeddings for cognitive insights.

Usage:
  python -m spark.index_embeddings --all
"""

from __future__ import annotations

import argparse
import sys
import time

from lib.semantic_index import SemanticIndex
from lib.cognitive_learner import get_cognitive_learner


def _progress(done: int, total: int, width: int = 24) -> str:
    if total <= 0:
        return "[no-items]"
    ratio = min(1.0, max(0.0, done / total))
    fill = int(ratio * width)
    bar = "#" * fill + "-" * (width - fill)
    return f"[{bar}] {done}/{total} ({ratio * 100:.0f}%)"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true", help="index all insights")
    ap.add_argument("--limit", type=int, default=0, help="max insights to index (0 = all)")
    ap.add_argument("--batch", type=int, default=100, help="batch size")
    ap.add_argument("--no-progress", action="store_true", help="disable progress output")
    args = ap.parse_args()

    limit = 0 if args.all else max(0, int(args.limit or 0))
    batch = max(1, int(args.batch or 100))

    learner = get_cognitive_learner()
    index = SemanticIndex()

    items = list(learner.insights.items())
    items.sort(key=lambda kv: getattr(kv[1], "reliability", 0.5), reverse=True)
    if limit:
        items = items[:limit]

    payload = []
    for key, insight in items:
        text = f"{getattr(insight, 'insight', '')} {getattr(insight, 'context', '')}".strip()
        if not text:
            continue
        payload.append((key, text))

    total = len(payload)
    if total == 0:
        print("[semantic] no eligible insights to index")
        return 0

    indexed = 0
    start = time.time()
    for i in range(0, total, batch):
        indexed += index.add_many(payload[i : i + batch])
        if not args.no_progress:
            print(_progress(min(i + batch, total), total), end="\r", flush=True)

    if not args.no_progress:
        print(_progress(total, total))

    elapsed = time.time() - start
    print(f"[semantic] indexed {indexed} items (of {total} eligible) in {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
