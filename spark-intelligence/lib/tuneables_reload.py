"""
Central tuneables reload coordinator.

Provides mtime-based hot-reload for all modules that consume tuneables.json.
Each module registers a callback via register_reload(). A single
check_and_reload() call checks the file mtime, validates via schema,
and dispatches changed sections to registered callbacks.

Usage:
    # In each module, register at import time:
    from lib.tuneables_reload import register_reload
    register_reload("meta_ralph", _reload_from_section)

    # From bridge cycle or CLI, periodically:
    from lib.tuneables_reload import check_and_reload
    changed = check_and_reload()
"""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

ReloadCallback = Callable[[Dict[str, Any]], None]

TUNEABLES_FILE = Path.home() / ".spark" / "tuneables.json"

_lock = threading.Lock()
_last_mtime: Optional[float] = None
_last_data: Dict[str, Any] = {}
_callbacks: Dict[str, List[Tuple[str, ReloadCallback]]] = {}

_reload_log: List[Dict[str, Any]] = []
_MAX_RELOAD_LOG = 20

logger = logging.getLogger("spark.tuneables_reload")


def register_reload(
    section: str,
    callback: ReloadCallback,
    *,
    label: Optional[str] = None,
) -> None:
    """Register a callback for when a tuneables section changes.

    Args:
        section: The tuneables.json section name (e.g., "meta_ralph").
        callback: Function called with the section dict when it changes.
        label: Human-readable label for diagnostics.
    """
    with _lock:
        if section not in _callbacks:
            _callbacks[section] = []
        _callbacks[section].append((
            label or f"{section}.callback_{len(_callbacks[section])}",
            callback,
        ))


def check_and_reload(*, force: bool = False) -> bool:
    """Check if tuneables.json changed and reload if so.

    Returns True if a reload happened, False if no change detected.
    Thread-safe via internal lock.
    """
    global _last_mtime, _last_data

    with _lock:
        current_mtime: Optional[float] = None
        try:
            if TUNEABLES_FILE.exists():
                current_mtime = TUNEABLES_FILE.stat().st_mtime
        except OSError:
            return False

        if not force and _last_mtime == current_mtime:
            return False

        # Read file
        try:
            if not TUNEABLES_FILE.exists():
                return False
            raw = json.loads(TUNEABLES_FILE.read_text(encoding="utf-8-sig"))
            if not isinstance(raw, dict):
                return False
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("tuneables_reload: read failed: %s", e)
            return False

        # Validate via schema (soft import to avoid circular deps)
        validated_data = raw
        try:
            from .tuneables_schema import validate_tuneables
            result = validate_tuneables(raw)
            validated_data = result.data
            for w in result.warnings:
                logger.warning("tuneables_reload: %s", w)
        except ImportError:
            pass
        except Exception as e:
            logger.warning("tuneables_reload: validation error: %s", e)

        old_data = _last_data
        _last_data = validated_data
        _last_mtime = current_mtime

        # Determine which registered sections changed
        changed_sections: List[str] = []
        for section_name in _callbacks:
            old_section = old_data.get(section_name)
            new_section = validated_data.get(section_name)
            if old_section != new_section:
                changed_sections.append(section_name)

        # First load: reload everything registered
        if not old_data:
            changed_sections = list(_callbacks.keys())

        if not changed_sections:
            _last_mtime = current_mtime
            return False

        # Dispatch callbacks
        errors: List[str] = []
        dispatched: List[str] = []
        for section_name in changed_sections:
            section_data = validated_data.get(section_name, {})
            if not isinstance(section_data, dict):
                section_data = {}
            for cb_label, cb in _callbacks.get(section_name, []):
                try:
                    cb(section_data)
                    dispatched.append(cb_label)
                except Exception as e:
                    err_msg = f"{cb_label}: {e}"
                    errors.append(err_msg)
                    logger.warning("tuneables_reload: callback error: %s", err_msg)

        # Log
        _reload_log.append({
            "ts": time.time(),
            "changed": changed_sections,
            "dispatched": dispatched,
            "errors": errors,
            "force": force,
        })
        while len(_reload_log) > _MAX_RELOAD_LOG:
            _reload_log.pop(0)

        if dispatched:
            logger.info(
                "tuneables_reload: reloaded %d sections (%s)",
                len(changed_sections), ", ".join(changed_sections),
            )

        return True


def get_validated_data() -> Dict[str, Any]:
    """Return the last validated tuneables data (may be empty before first load)."""
    with _lock:
        return dict(_last_data)


def get_section(section_name: str) -> Dict[str, Any]:
    """Return a specific validated section (empty dict if not loaded)."""
    with _lock:
        section = _last_data.get(section_name, {})
        return dict(section) if isinstance(section, dict) else {}


def get_reload_log() -> List[Dict[str, Any]]:
    """Return recent reload events for diagnostics."""
    with _lock:
        return list(_reload_log)


def get_registered_sections() -> Dict[str, List[str]]:
    """Return registered sections and their callback labels."""
    with _lock:
        return {
            section: [label for label, _ in cbs]
            for section, cbs in _callbacks.items()
        }
