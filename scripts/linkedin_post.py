#!/usr/bin/env python3
"""Post to LinkedIn using the API"""
import json
import urllib.request
import sys

TOKEN_PATH = "/home/andreprado/.openclaw/.secrets/linkedin_token.json"
LINKEDIN_SUB = "eqDpblb7zU"

def post_text(text: str):
    with open(TOKEN_PATH) as f:
        token = json.load(f)

    payload = {
        "author": f"urn:li:person:{LINKEDIN_SUB}",
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        },
    }

    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.linkedin.com/v2/ugcPosts",
        data=data,
        headers={
            "Authorization": f"Bearer {token['access_token']}",
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
        },
    )

    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f"✅ Posted! ID: {result.get('id', 'unknown')}")
        return result
    except urllib.error.HTTPError as e:
        print(f"❌ Error {e.code}: {e.read().decode()}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 linkedin_post.py 'Your post text'")
        sys.exit(1)
    post_text(sys.argv[1])
