#!/usr/bin/env python3
"""Read LinkedIn posts, comments, and reactions"""
import json
import urllib.request
import urllib.parse
import sys

TOKEN_PATH = "/home/andreprado/.openclaw/.secrets/linkedin_token.json"
LINKEDIN_SUB = "eqDpblb7zU"


def _headers():
    with open(TOKEN_PATH) as f:
        token = json.load(f)
    return {
        "Authorization": f"Bearer {token['access_token']}",
        "X-Restli-Protocol-Version": "2.0.0",
    }


def _get(url):
    req = urllib.request.Request(url, headers=_headers())
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"❌ Error {e.code}: {e.read().decode()}")
        return None


def get_my_posts(count=10):
    """Get recent posts by the authenticated user"""
    url = (
        f"https://api.linkedin.com/v2/ugcPosts"
        f"?q=authors&authors=List(urn%3Ali%3Aperson%3A{LINKEDIN_SUB})"
        f"&count={count}"
        f"&sortBy=LAST_MODIFIED"
    )
    data = _get(url)
    if not data:
        return []

    posts = []
    for el in data.get("elements", []):
        post_id = el.get("id", "")
        text = ""
        sc = el.get("specificContent", {})
        share = sc.get("com.linkedin.ugc.ShareContent", {})
        text = share.get("shareCommentary", {}).get("text", "")
        created = el.get("created", {}).get("time", 0)
        posts.append({"id": post_id, "text": text[:200], "created": created})

    return posts


def get_comments(post_urn, count=20):
    """Get comments on a post"""
    encoded = urllib.parse.quote(post_urn, safe="")
    url = (
        f"https://api.linkedin.com/v2/socialActions/{encoded}/comments"
        f"?count={count}"
    )
    data = _get(url)
    if not data:
        return []

    comments = []
    for el in data.get("elements", []):
        comments.append({
            "actor": el.get("actor", ""),
            "message": el.get("message", {}).get("text", ""),
            "created": el.get("created", {}).get("time", 0),
        })
    return comments


def get_reactions(post_urn):
    """Get reaction summary on a post"""
    encoded = urllib.parse.quote(post_urn, safe="")
    url = f"https://api.linkedin.com/v2/socialActions/{encoded}"
    data = _get(url)
    if not data:
        return {}
    return {
        "likes": data.get("likesSummary", {}).get("totalLikes", 0),
        "comments": data.get("commentsSummary", {}).get("totalFirstLevelComments", 0),
    }


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "posts"

    if cmd == "posts":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        posts = get_my_posts(count)
        for i, p in enumerate(posts):
            print(f"\n--- Post {i+1} ---")
            print(f"ID: {p['id']}")
            print(f"Text: {p['text']}...")
            stats = get_reactions(p["id"])
            if stats:
                print(f"👍 {stats.get('likes',0)} | 💬 {stats.get('comments',0)}")

    elif cmd == "comments":
        if len(sys.argv) < 3:
            print("Usage: linkedin_reader.py comments <post_urn>")
            sys.exit(1)
        post_urn = sys.argv[2]
        comments = get_comments(post_urn)
        if not comments:
            print("Nenhum comentário encontrado.")
        for c in comments:
            print(f"\n💬 {c['message']}")
            print(f"   Actor: {c['actor']}")

    else:
        print("Usage: linkedin_reader.py [posts|comments] [args]")
