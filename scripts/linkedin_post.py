#!/usr/bin/env python3
"""Post to LinkedIn using REST Posts API."""
import json
import urllib.request
import urllib.error
import sys
import os

TOKEN_PATH = "/home/andreprado/.openclaw/.secrets/linkedin_token.json"
LINKEDIN_SUB = "eqDpblb7zU"
LINKEDIN_VERSION = os.getenv("LINKEDIN_VERSION", "202602")


def _headers(token, extra=None):
    headers = {
        "Authorization": f"Bearer {token['access_token']}",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_VERSION,
    }
    if extra:
        headers.update(extra)
    return headers


def build_payload(text: str):
    return {
        "author": f"urn:li:person:{LINKEDIN_SUB}",
        "commentary": text,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }


def post_text(text: str, dry_run: bool = False):
    with open(TOKEN_PATH) as f:
        token = json.load(f)

    payload = build_payload(text)

    if dry_run:
        print("🧪 DRY RUN (não publicou)")
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return {"dry_run": True, "payload": payload}

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.linkedin.com/rest/posts",
        data=data,
        headers=_headers(token),
        method="POST",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode(errors="ignore")
            restli_id = resp.headers.get("x-restli-id")
            result = json.loads(body) if body else {}
            if restli_id and "id" not in result:
                result["id"] = restli_id
            print(f"✅ Posted! ID: {result.get('id', restli_id or 'unknown')}")
            return result
    except urllib.error.HTTPError as e:
        print(f"❌ Error {e.code}: {e.read().decode(errors='ignore')}")
        return None


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print("Usage: python3 linkedin_post.py 'Seu texto' [--dry-run]")
        sys.exit(1)

    dry_run = "--dry-run" in args
    text_parts = [a for a in args if a != "--dry-run"]
    if not text_parts:
        print("Usage: python3 linkedin_post.py 'Seu texto' [--dry-run]")
        sys.exit(1)

    post_text(" ".join(text_parts), dry_run=dry_run)
