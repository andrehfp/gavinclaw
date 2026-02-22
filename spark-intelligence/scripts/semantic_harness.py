#!/usr/bin/env python3
"""Quick semantic retrieval harness (replays real-ish contexts)."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.cognitive_learner import get_cognitive_learner  # noqa: E402
from lib.semantic_retriever import SemanticRetriever  # noqa: E402


DEFAULT_CONTEXTS = [
    "edit src/auth/login.py",
    "push main",
    "rm -rf ",
    "fix game physics jitter",
    "refactor payment webhook",
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=8, help="max results to show")
    ap.add_argument("--context", action="append", help="context string (repeatable)")
    args = ap.parse_args()

    contexts = args.context or DEFAULT_CONTEXTS
    learner = get_cognitive_learner()
    retriever = SemanticRetriever()

    for ctx in contexts:
        print(f"\nContext: {ctx}")
        results = retriever.retrieve(ctx, learner.insights, limit=max(1, int(args.limit)))
        if not results:
            print("  (no results)")
            continue
        for r in results:
            print(
                f"  - {r.insight_text[:140]} "
                f"[key={r.insight_key} sim={r.semantic_sim:.2f} fusion={r.fusion_score:.2f}] "
                f"why={r.why}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
