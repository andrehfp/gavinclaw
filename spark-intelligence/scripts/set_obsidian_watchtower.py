#!/usr/bin/env python3
"""Set Obsidian watchtower export settings in the active tuneables file."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def _load_tuneables(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _set_flag_value(enabled: bool | None) -> Dict[str, Any] | None:
    if enabled is None:
        return None
    return {"obsidian_enabled": bool(enabled)}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Configure Obsidian watchtower export settings in ~/.spark/tuneables.json"
    )
    parser.add_argument(
        "--path",
        default=str(Path.home() / ".spark" / "tuneables.json"),
        help="Path to tuneables JSON file.",
    )
    parser.add_argument(
        "--vault-dir",
        help="Override path used for advisory watchtower exports.",
    )
    parser.add_argument(
        "--enable",
        dest="enabled",
        action="store_true",
        help="Enable watchtower export.",
    )
    parser.add_argument(
        "--disable",
        dest="enabled",
        action="store_false",
        help="Disable watchtower export.",
    )
    parser.set_defaults(enabled=None)
    parser.add_argument(
        "--auto-export",
        dest="auto_export",
        action="store_true",
        help="Enable automatic export (on build/save).",
    )
    parser.add_argument(
        "--no-auto-export",
        dest="auto_export",
        action="store_false",
        help="Disable automatic export.",
    )
    parser.set_defaults(auto_export=None)
    parser.add_argument(
        "--max-packets",
        type=int,
        help="Maximum number of packets to keep in Obsidian export.",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Show current advisory watchtower settings and exit.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Persist updates (default is dry-run preview).",
    )

    args = parser.parse_args()
    tuneables_path = Path(args.path).expanduser()

    current = _load_tuneables(tuneables_path)
    patch = {}
    advisory = {}

    current_advisory = current.get("advisory_packet_store") if isinstance(current.get("advisory_packet_store"), dict) else {}
    if not isinstance(current_advisory, dict):
        current_advisory = {}

    if args.vault_dir is not None:
        advisory["obsidian_export_dir"] = str(Path(args.vault_dir).expanduser())
    if args.enabled is not None:
        advisory["obsidian_enabled"] = bool(args.enabled)
    if args.auto_export is not None:
        advisory["obsidian_auto_export"] = bool(args.auto_export)
    if args.max_packets is not None:
        advisory["obsidian_export_max_packets"] = max(1, min(5000, int(args.max_packets)))

    if advisory:
        patch["advisory_packet_store"] = advisory

    if args.show and not patch:
        current_cfg = {
            "path": str(tuneables_path),
            "advisory_packet_store": current_advisory,
        }
        print(json.dumps(current_cfg, indent=2))
        return 0

    merged = _deep_merge(current, patch)
    preview = {"advisory_packet_store": merged.get("advisory_packet_store", {})}
    print("Watchtower patch:")
    print(json.dumps(patch if patch else {"advisory_packet_store": current_advisory}, indent=2))
    print("")
    print(f"Target file: {tuneables_path}")

    if not args.write:
        print("Dry-run only. Re-run with --write to persist these changes.")
        return 0

    if not patch:
        print("No changes requested. Nothing to write.")
        return 0

    tuneables_path.parent.mkdir(parents=True, exist_ok=True)
    if tuneables_path.exists():
        backup = tuneables_path.with_name(f"tuneables.backup_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json")
        backup.write_text(tuneables_path.read_text(encoding="utf-8-sig"), encoding="utf-8")
        print(f"Backup written: {backup}")

    tuneables_path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    print(f"Updated {tuneables_path}")
    print("Resulting advisory_packet_store:")
    print(json.dumps(preview["advisory_packet_store"], indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
