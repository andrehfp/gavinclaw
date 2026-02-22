#!/usr/bin/env python3
"""emit_event — tiny helper to generate SparkEventV1 JSON

Purpose: cross-environment compatibility.
Any tool/IDE (Cursor/VSCode tasks, shell scripts, CI) can call this to emit a
well-formed SparkEventV1 and pipe it into `adapters/stdin_ingest.py`.

Examples:
  python3 scripts/emit_event.py --source cursor --kind command --session proj \
    --intent remember --text "Compatibility across environments is a hard constraint"

  python3 scripts/emit_event.py --source cursor --kind message --session proj \
    --role user --text "I hate stuck UIs" 
"""

import argparse
import json
import time
import hashlib


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", default="stdin", help="event source label")
    ap.add_argument("--kind", default="message", choices=["message", "tool", "command", "system"])
    ap.add_argument("--session", default="default", help="session/thread id")
    ap.add_argument("--role", default=None, help="message role (user/assistant/system)")
    ap.add_argument("--intent", default=None, help="command intent (e.g. remember)")
    ap.add_argument("--category", default=None, help="optional category for remember intent")
    ap.add_argument("--text", default="", help="primary text")
    ap.add_argument("--meta", default=None, help="extra JSON object as string")
    args = ap.parse_args()

    payload = {}
    if args.text:
        payload["text"] = args.text
    if args.role:
        payload["role"] = args.role
    if args.intent:
        payload["intent"] = args.intent
    if args.category:
        payload["category"] = args.category
    if args.meta:
        try:
            payload["meta"] = json.loads(args.meta)
        except Exception:
            payload["meta_raw"] = args.meta

    ts = time.time()
    raw = f"{args.source}|{args.kind}|{args.session}|{payload.get('intent','')}|{payload.get('text','')}".encode("utf-8")
    trace_id = hashlib.sha1(raw).hexdigest()[:16]

    evt = {
        "v": 1,
        "source": args.source,
        "kind": args.kind,
        "ts": ts,
        "session_id": args.session,
        "payload": payload,
        "trace_id": trace_id,
    }

    print(json.dumps(evt, ensure_ascii=False))


if __name__ == "__main__":
    main()
