"""Smoke check for consciousness bridge -> advisory strategy wiring."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional

from lib.consciousness_bridge import resolve_strategy
from lib.advisory_synthesizer import _emotion_decision_hooks


def run_smoke(path: Optional[Path] = None) -> dict:
    bridge = resolve_strategy(path=path)
    hooks = _emotion_decision_hooks()
    strategy = hooks.get("strategy") if isinstance(hooks.get("strategy"), dict) else {}
    bridge_meta = hooks.get("bridge") if isinstance(hooks.get("bridge"), dict) else {}
    return {
        "bridge_source": bridge.get("source", "fallback"),
        "bridge_max_influence": bridge.get("max_influence", 0.0),
        "strategy_source": hooks.get("strategy_source", "default"),
        "source_chain": hooks.get("source_chain", ["default"]),
        "bridge_applied": bool(bridge_meta.get("applied", False)),
        "effective_strategy": {
            "response_pace": strategy.get("response_pace", "balanced"),
            "verbosity": strategy.get("verbosity", "medium"),
            "tone_shape": strategy.get("tone_shape", "grounded_warm"),
            "ask_clarifying_question": bool(strategy.get("ask_clarifying_question", False)),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Consciousness bridge smoke check.")
    parser.add_argument(
        "--bridge-path",
        type=Path,
        default=None,
        help="Optional path to bridge.v1 payload JSON file.",
    )
    args = parser.parse_args()
    result = run_smoke(path=args.bridge_path)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
