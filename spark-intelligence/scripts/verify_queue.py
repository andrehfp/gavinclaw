#!/usr/bin/env python3
"""Minimal queue verification (no external deps)."""

import os
import tempfile
import shutil


def main() -> int:
    temp_home = tempfile.mkdtemp(prefix="spark-queue-test-")
    try:
        # Ensure Path.home() points at the temp dir.
        os.environ["USERPROFILE"] = temp_home
        os.environ["HOME"] = temp_home

        from lib import queue

        # Write a few events.
        for i in range(3):
            queue.quick_capture(
                event_type=queue.EventType.USER_PROMPT,
                session_id="test-session",
                data={"i": i},
            )

        if queue.count_events() != 3:
            print("FAIL: expected 3 events")
            return 1

        recent = queue.read_recent_events(2)
        if len(recent) != 2:
            print("FAIL: expected 2 recent events")
            return 1

        # Force rotation.
        queue.MAX_EVENTS = 2
        queue.rotate_if_needed()
        if queue.count_events() > 2:
            print("FAIL: rotation did not reduce size")
            return 1

        print("OK queue verify")
        return 0
    finally:
        shutil.rmtree(temp_home, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
