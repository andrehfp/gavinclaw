#!/usr/bin/env python3
"""
Reddit Comment Poster via API (no PRAW needed)
Uses Camofox session cookies for auth. Supports multiple accounts.

Usage:
  python3 reddit_comment.py <post_url_or_id> "comment text"
  python3 reddit_comment.py <post_url_or_id> "comment text" --account listing_lab
  python3 reddit_comment.py --subreddit realtors --account listing_lab
  python3 reddit_comment.py --test
  python3 reddit_comment.py --test --account listing_lab
  python3 reddit_comment.py --list-accounts

Accounts stored in: scripts/reddit_accounts.json
Default account: maia_archviz (if no --account specified)
"""

import sys
import json
import urllib.request
import urllib.parse
import re
import argparse
import os
import time

CAMOFOX_URL = os.environ.get("CAMOFOX_URL", "http://localhost:9377")
CAMOFOX_USER_ID = os.environ.get("CAMOFOX_USER_ID", "main")
CAMOFOX_SESSION_KEY = os.environ.get("CAMOFOX_SESSION_KEY", "reddit-seeding")
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0"
ACCOUNTS_FILE = os.path.join(os.path.dirname(__file__), "reddit_accounts.json")
DEFAULT_ACCOUNT = "maia_archviz"


def load_accounts():
    """Load account credentials from JSON file."""
    if not os.path.exists(ACCOUNTS_FILE):
        return {}
    with open(ACCOUNTS_FILE) as f:
        return json.load(f)


def get_account_creds(account_name):
    """Get credentials for a specific account."""
    accounts = load_accounts()
    if account_name not in accounts:
        available = list(accounts.keys())
        raise ValueError(f"Account '{account_name}' not found. Available: {available}")
    return accounts[account_name]


def camofox_request(path):
    """Make a request to Camofox API."""
    req = urllib.request.Request(f"{CAMOFOX_URL}{path}")
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def get_tab_username(tab_id):
    """Get the logged-in Reddit username for a Camofox tab."""
    try:
        data = camofox_request(f"/tabs/{tab_id}/cookies?userId={CAMOFOX_USER_ID}")
        cookies = {c["name"]: c["value"] for c in data.get("cookies", [])}
        if "reddit_session" not in cookies:
            return None
        # Quick API check
        session = cookies["reddit_session"]
        me = reddit_api("/api/me.json", session)
        return me.get("data", {}).get("name")
    except Exception:
        return None


def login_in_new_tab(username, password):
    """Open a new Camofox tab and log in to Reddit. Returns session cookie."""
    # Create new tab
    req = urllib.request.Request(
        f"{CAMOFOX_URL}/tabs",
        data=json.dumps({
            "userId": CAMOFOX_USER_ID,
            "sessionKey": CAMOFOX_SESSION_KEY,
            "url": "https://old.reddit.com/login"
        }).encode(),
        method="POST"
    )
    req.add_header("Content-Type", "application/json")
    resp = urllib.request.urlopen(req)
    tab_data = json.loads(resp.read())
    tab_id = tab_data["tabId"]

    time.sleep(3)

    # Fill username
    _camofox_action(tab_id, {"kind": "fill", "selector": "input[name='user']", "text": username})
    time.sleep(0.5)
    # Fill password
    _camofox_action(tab_id, {"kind": "fill", "selector": "input[name='passwd']", "text": password})
    time.sleep(0.5)
    # Submit
    _camofox_action(tab_id, {"kind": "click", "selector": "button[type='submit']"})
    time.sleep(4)

    # Get session cookie
    data = camofox_request(f"/tabs/{tab_id}/cookies?userId={CAMOFOX_USER_ID}")
    for c in data.get("cookies", []):
        if c["name"] == "reddit_session":
            return c["value"], tab_id

    raise RuntimeError(f"Login failed for {username} — no reddit_session cookie after login")


def _camofox_action(tab_id, action):
    """Send an action to a Camofox tab."""
    # New Camofox API uses /act with {kind, targetId, userId, ...}
    kind = action.get("kind")
    if kind == "fill":
        kind = "type"

    payload = {
        "userId": CAMOFOX_USER_ID,
        "targetId": tab_id,
        "kind": kind,
    }

    for key in ("selector", "ref", "text", "key", "doubleClick", "submit", "direction", "amount"):
        if key in action:
            payload[key] = action[key]

    req = urllib.request.Request(
        f"{CAMOFOX_URL}/act",
        data=json.dumps(payload).encode(),
        method="POST"
    )
    req.add_header("Content-Type", "application/json")
    urllib.request.urlopen(req)


def get_reddit_session(account_name=None):
    """
    Get reddit_session cookie for the specified account.
    
    - If account_name is None: use any open Reddit tab (old behavior)
    - If account_name is specified: find a tab logged in as that user,
      or log in automatically using saved credentials.
    """
    tabs_data = camofox_request(f"/tabs?userId={CAMOFOX_USER_ID}")
    tabs = tabs_data.get("tabs", [])
    reddit_tabs = [t for t in tabs if "reddit" in t.get("url", "")]

    if account_name is None:
        # Old behavior: use first reddit tab with a session
        for tab in reddit_tabs:
            tab_id = tab["tabId"]
            data = camofox_request(f"/tabs/{tab_id}/cookies?userId={CAMOFOX_USER_ID}")
            for c in data.get("cookies", []):
                if c["name"] == "reddit_session":
                    return c["value"]
        raise RuntimeError("No reddit_session cookie found in Camofox tabs")

    # Look for a tab already logged in as the target account
    creds = get_account_creds(account_name)
    target_username = creds["username"]

    for tab in reddit_tabs:
        tab_id = tab["tabId"]
        data = camofox_request(f"/tabs/{tab_id}/cookies?userId={CAMOFOX_USER_ID}")
        cookies = {c["name"]: c["value"] for c in data.get("cookies", [])}
        if "reddit_session" in cookies:
            try:
                me = reddit_api("/api/me.json", cookies["reddit_session"])
                logged_as = me.get("data", {}).get("name", "")
                if logged_as.lower() == target_username.lower():
                    return cookies["reddit_session"]
            except Exception:
                continue

    # No matching tab found — log in automatically
    print(f"⚙️  No open tab for u/{target_username}. Logging in...", file=sys.stderr)
    session, tab_id = login_in_new_tab(target_username, creds["password"])
    print(f"✅ Logged in as u/{target_username}", file=sys.stderr)
    return session


def reddit_api(endpoint, session_cookie, data=None, method="GET"):
    """Make a Reddit API request."""
    url = f"https://old.reddit.com{endpoint}"
    
    if data and method == "POST":
        encoded = urllib.parse.urlencode(data).encode()
        req = urllib.request.Request(url, data=encoded, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
    else:
        req = urllib.request.Request(url, method=method)
    
    req.add_header("User-Agent", USER_AGENT)
    req.add_header("Cookie", f"reddit_session={session_cookie}")
    
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())


def get_modhash(session_cookie):
    """Get modhash for authenticated requests."""
    data = reddit_api("/api/me.json", session_cookie)
    return data["data"]["modhash"]


def extract_thing_id(url_or_id):
    """Extract Reddit thing ID (t3 post or t1 comment) from URL or direct ID."""
    # Already full thing_id
    if url_or_id.startswith("t3_") or url_or_id.startswith("t1_"):
        return url_or_id

    # Full comment URL format (old/new reddit): .../comments/<post_id>/<slug>/<comment_id>/
    comment_match = re.search(r'/comments/[a-z0-9]+/[^/]+/([a-z0-9]+)/?', url_or_id)
    if comment_match:
        return f"t1_{comment_match.group(1)}"

    # Post URL format
    post_match = re.search(r'/comments/([a-z0-9]+)/', url_or_id)
    if post_match:
        return f"t3_{post_match.group(1)}"

    # Bare ID support: t1/t3 short IDs and default-to-post legacy behavior
    if re.match(r'^[a-z0-9]+$', url_or_id):
        # Most legacy calls pass post IDs, keep backward compatibility
        return f"t3_{url_or_id}"

    raise ValueError(f"Can't extract Reddit thing ID from: {url_or_id}")


def normalize_comment_text(text):
    """Normalize escaped sequences commonly produced by LLM output."""
    if not isinstance(text, str):
        return text

    normalized = text.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "\t")
    # Keep paragraphs readable, avoid accidental huge blank runs
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def post_comment(session_cookie, post_url_or_id, text):
    """Post a comment on a Reddit post or reply to a comment."""
    modhash = get_modhash(session_cookie)
    thing_id = extract_thing_id(post_url_or_id)
    text = normalize_comment_text(text)

    result = reddit_api("/api/comment", session_cookie, data={
        "thing_id": thing_id,
        "text": text,
        "uh": modhash,
        "api_type": "json"
    }, method="POST")
    
    errors = result.get("json", {}).get("errors", [])
    if errors:
        print(f"❌ Error: {errors}", file=sys.stderr)
        return None
    
    # Extract comment info
    things = result.get("json", {}).get("data", {}).get("things", [])
    if things:
        content = things[0].get("data", {}).get("content", "")
        # Extract permalink from content
        permalink_match = re.search(r'data-permalink="([^"]+)"', content)
        permalink = permalink_match.group(1) if permalink_match else "unknown"
        
        # Extract comment ID
        id_match = re.search(r'data-fullname="(t1_[a-z0-9]+)"', content)
        comment_id = id_match.group(1) if id_match else "unknown"
        
        print(f"✅ Comment posted! ID: {comment_id}")
        print(f"   URL: https://old.reddit.com{permalink}")
        return comment_id
    
    print("⚠️ Comment may have posted but couldn't confirm")
    return None


def list_posts(session_cookie, subreddit, sort="hot", limit=10):
    """List posts from a subreddit."""
    data = reddit_api(f"/r/{subreddit}/{sort}.json?limit={limit}", session_cookie)
    posts = data.get("data", {}).get("children", [])
    
    for i, post in enumerate(posts, 1):
        p = post["data"]
        print(f"{i}. [{p['score']:>5}] {p['title'][:80]}")
        print(f"   ID: t3_{p['id']} | {p['num_comments']} comments | {p['url'][:80]}")
        print()
    
    return posts


def test_auth(session_cookie):
    """Test authentication."""
    data = reddit_api("/api/me.json", session_cookie)
    user = data.get("data", {})
    print(f"✅ Authenticated as: u/{user.get('name')}")
    print(f"   Comment karma: {user.get('comment_karma')}")
    print(f"   Post karma: {user.get('link_karma')}")
    print(f"   Modhash: {user.get('modhash', 'none')[:20]}...")


def main():
    parser = argparse.ArgumentParser(description="Reddit Comment Poster — multi-account")
    parser.add_argument("post", nargs="?", help="Post URL or ID to comment on")
    parser.add_argument("comment", nargs="?", help="Comment text")
    parser.add_argument("--account", "-a", default=DEFAULT_ACCOUNT,
                        help=f"Reddit account to use (default: {DEFAULT_ACCOUNT})")
    parser.add_argument("--subreddit", "-s", help="List posts from subreddit")
    parser.add_argument("--sort", default="hot", choices=["hot", "new", "rising", "top"])
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--test", action="store_true", help="Test authentication")
    parser.add_argument("--list-accounts", action="store_true", help="List available accounts")

    args = parser.parse_args()

    if args.list_accounts:
        accounts = load_accounts()
        print("Available accounts:")
        for name, info in accounts.items():
            print(f"  • {name} — {info.get('purpose', '')}")
        return

    session = get_reddit_session(args.account)

    if args.test:
        print(f"Account: {args.account}")
        test_auth(session)
    elif args.subreddit:
        list_posts(session, args.subreddit, args.sort, args.limit)
    elif args.post and args.comment:
        post_comment(session, args.post, args.comment)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
