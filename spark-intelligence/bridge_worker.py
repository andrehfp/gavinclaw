#!/usr/bin/env python3
"""bridge_worker -- keep SPARK_CONTEXT.md fresh

This is the practical mechanism that makes Spark affect behavior in Clawdbot.
Clawdbot's spark-context hook injects SPARK_CONTEXT.md; this worker keeps it
updated automatically.

Design:
- Adaptive TTL loop (auto-tunes interval based on queue depth)
- Priority-aware event processing (failures/prompts first)
- Queue consumption (processed events are removed, queue stays bounded)
- Deep learning extraction (tool effectiveness, error patterns, workflows)
- Safe: best-effort, never crashes the host

Usage:
  python3 bridge_worker.py --interval 30

Optional:
  python3 bridge_worker.py --interval 30 --query "current task here"
"""

import argparse
import atexit
import os
import time
import threading
from pathlib import Path

from lib.bridge_cycle import run_bridge_cycle, write_bridge_heartbeat
from lib.diagnostics import setup_component_logging, log_exception


def _pid_is_alive(pid: int) -> bool:
    try:
        os.kill(int(pid), 0)
        return True
    except PermissionError:
        return True
    except Exception:
        return False


def _acquire_single_instance_lock(name: str) -> Path | None:
    lock_dir = Path.home() / ".spark" / "pids"
    lock_dir.mkdir(parents=True, exist_ok=True)
    lock_file = lock_dir / f"{name}.lock"
    pid = os.getpid()

    if lock_file.exists():
        try:
            existing_pid = int(lock_file.read_text(encoding="utf-8").strip())
            if existing_pid != pid and _pid_is_alive(existing_pid):
                print(f"[SPARK] {name} already running with pid {existing_pid}; exiting duplicate instance")
                return None
        except Exception:
            pass

    lock_file.write_text(str(pid), encoding="utf-8")

    def _cleanup_lock() -> None:
        try:
            if lock_file.exists() and lock_file.read_text(encoding="utf-8").strip() == str(pid):
                lock_file.unlink(missing_ok=True)
        except Exception:
            pass

    atexit.register(_cleanup_lock)
    return lock_file


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int, default=30, help="base seconds between updates (auto-tuned)")
    ap.add_argument("--query", default=None, help="optional fixed query to tailor context")
    ap.add_argument("--once", action="store_true", help="run one cycle then exit")
    args = ap.parse_args()

    setup_component_logging("bridge_worker")
    lock_file = _acquire_single_instance_lock("bridge_worker")
    if lock_file is None:
        return

    stop_event = threading.Event()

    def _shutdown(signum=None, frame=None):
        stop_event.set()

    try:
        import signal
        signal.signal(signal.SIGINT, _shutdown)
        signal.signal(signal.SIGTERM, _shutdown)
    except Exception:
        pass

    current_interval = max(10, int(args.interval))

    while not stop_event.is_set():
        try:
            stats = run_bridge_cycle(
                query=args.query,
                memory_limit=60,
                pattern_limit=200,
            )
            write_bridge_heartbeat(stats)

            # Auto-tune interval based on pipeline metrics
            pipeline_data = stats.get("pipeline")
            if pipeline_data:
                try:
                    from lib.pipeline import ProcessingMetrics, compute_next_interval
                    bp_level = pipeline_data.get("health", {}).get(
                        "backpressure_level", "healthy"
                    )
                    events_read = pipeline_data.get("events_read", 0)

                    # Create a lightweight metrics object for interval computation
                    m = ProcessingMetrics()
                    m.backpressure_level = bp_level
                    m.events_read = events_read
                    current_interval = compute_next_interval(
                        m, base_interval=args.interval
                    )
                except Exception:
                    current_interval = max(10, int(args.interval))
        except Exception as e:
            log_exception("bridge_worker", "bridge cycle failed", e)
            current_interval = max(10, int(args.interval))

        if args.once:
            break

        stop_event.wait(max(5, current_interval))


if __name__ == "__main__":
    main()
