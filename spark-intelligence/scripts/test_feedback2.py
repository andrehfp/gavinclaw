#!/usr/bin/env python3
"""Debug feedback ingestion errors."""
import sys, os, json, traceback
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pathlib import Path
REPORTS_DIR = Path.home() / ".openclaw" / "workspace" / "spark_reports"

for f in sorted(REPORTS_DIR.glob("*.json")):
    print(f"\n--- {f.name} ---")
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        kind = data.get("kind")
        print(f"  kind={kind}")
        
        if kind == "outcome":
            from lib.feedback_loop import _process_outcome, _load_state
            state = _load_state()
            _process_outcome(data, state)
            print("  OK")
        elif kind == "decision":
            from lib.feedback_loop import _process_decision, _load_state
            state = _load_state()
            _process_decision(data, state)
            print("  OK")
        elif kind == "preference":
            from lib.feedback_loop import _process_preference, _load_state
            state = _load_state()
            _process_preference(data, state)
            print("  OK")
    except Exception as e:
        traceback.print_exc()
