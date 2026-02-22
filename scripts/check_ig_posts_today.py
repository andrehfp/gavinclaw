#!/usr/bin/env python3
"""
Check how many posts @studio.maia.arch made today.
Exit 0 = ok to post, exit 1 = already posted too many times today.
Usage: python3 check_ig_posts_today.py [--max N]
"""
import json, requests, sys, argparse
from datetime import datetime, timezone

parser = argparse.ArgumentParser()
parser.add_argument("--max", type=int, default=4, help="Max posts allowed per day")
parser.add_argument("--count", action="store_true", help="Just print count")
args = parser.parse_args()

with open("/home/andreprado/.openclaw/.secrets/instagram_maia_api.json") as f:
    creds = json.load(f)

token = creds["page_access_token"]
ig_id = creds["ig_account_id"]
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

r = requests.get(f"https://graph.facebook.com/v21.0/{ig_id}/media",
    params={"fields": "id,timestamp,media_type", "limit": 20, "access_token": token})
r.raise_for_status()

posts_today = [p for p in r.json().get("data", []) if p.get("timestamp", "").startswith(today)]
count = len(posts_today)

if args.count:
    print(count)
    sys.exit(0)

print(f"Posts today: {count}/{args.max}")
if count >= args.max:
    print(f"⛔ Limit reached ({count} >= {args.max}). Skipping post.")
    sys.exit(1)
else:
    print(f"✅ OK to post ({count} < {args.max})")
    sys.exit(0)
