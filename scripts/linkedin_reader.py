#!/usr/bin/env python3
"""Read LinkedIn posts, comments, and basic engagement summary (REST API)."""
import json
import urllib.request
import urllib.parse
import urllib.error
import sys
import os

TOKEN_PATH = "/home/andreprado/.openclaw/.secrets/linkedin_token.json"
LINKEDIN_SUB = "eqDpblb7zU"
LINKEDIN_VERSION = os.getenv("LINKEDIN_VERSION", "202602")


def _headers(extra=None):
    with open(TOKEN_PATH) as f:
        token = json.load(f)
    headers = {
        "Authorization": f"Bearer {token['access_token']}",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_VERSION,
    }
    if extra:
        headers.update(extra)
    return headers


def _request(url, method="GET", data=None, extra_headers=None):
    req = urllib.request.Request(url, method=method, data=data, headers=_headers(extra_headers))
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode() if resp.readable() else ""
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        print(f"❌ Error {e.code}: {body}")
        return None


def get_my_posts(count=10, start=0, view_context="READER"):
    """Get recent posts by the authenticated member."""
    author = urllib.parse.quote(f"urn:li:person:{LINKEDIN_SUB}", safe="")
    url = (
        "https://api.linkedin.com/rest/posts"
        f"?q=author&author={author}"
        f"&count={count}&start={start}"
        f"&sortBy=LAST_MODIFIED&viewContext={view_context}"
    )
    data = _request(url, extra_headers={"X-RestLi-Method": "FINDER"})
    if not data:
        return []

    posts = []
    for el in data.get("elements", []):
        text = (el.get("commentary") or "").strip()
        created = el.get("createdAt", 0)
        post_id = el.get("id", "")
        posts.append({
            "id": post_id,
            "text": text[:280],
            "created": created,
        })
    return posts


def get_comments(post_urn, count=20):
    """Get comments on a post URN."""
    encoded = urllib.parse.quote(post_urn, safe="")
    url = f"https://api.linkedin.com/rest/socialActions/{encoded}/comments?count={count}"
    data = _request(url)
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
    """Get reaction/comment summary for a post URN."""
    encoded = urllib.parse.quote(post_urn, safe="")
    url = f"https://api.linkedin.com/rest/socialActions/{encoded}"
    data = _request(url)
    if not data:
        return {}

    likes = data.get("likesSummary", {}).get("totalLikes", 0)
    comments = data.get("commentsSummary", {}).get("totalFirstLevelComments", 0)
    return {"likes": likes, "comments": comments}


def print_posts(count=5):
    posts = get_my_posts(count)
    if not posts:
        print("Nenhum post retornado ou sem permissão (r_member_social).")
        return

    for i, p in enumerate(posts, 1):
        print(f"\n--- Post {i} ---")
        print(f"ID: {p['id']}")
        print(f"Text: {p['text']}...")
        stats = get_reactions(p["id"])
        if stats:
            print(f"👍 {stats.get('likes', 0)} | 💬 {stats.get('comments', 0)}")


def print_status():
    with open(TOKEN_PATH) as f:
        token = json.load(f)
    scopes = set((token.get("scope") or "").replace(",", " ").split())

    print(f"LinkedIn-Version: {LINKEDIN_VERSION}")
    print(f"Scopes token: {', '.join(sorted(scopes)) or '(none)'}")
    print(f"w_member_social: {'✅' if 'w_member_social' in scopes else '❌'}")
    print(f"r_member_social: {'✅' if 'r_member_social' in scopes else '❌'}")

    # quick connectivity check (read path)
    posts = get_my_posts(1)
    if posts:
        print("Read API (posts finder): ✅")
    else:
        print("Read API (posts finder): ⚠️ sem acesso ou sem posts")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "posts"

    if cmd == "posts":
        count = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        print_posts(count)

    elif cmd == "comments":
        if len(sys.argv) < 3:
            print("Usage: linkedin_reader.py comments <post_urn>")
            sys.exit(1)
        for c in get_comments(sys.argv[2]):
            print(f"\n💬 {c['message']}")
            print(f"   Actor: {c['actor']}")

    elif cmd == "status":
        print_status()

    else:
        print("Usage: linkedin_reader.py [posts|comments|status] [args]")
