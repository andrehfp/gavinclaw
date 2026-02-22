#!/usr/bin/env python3
"""Check and reply to Instagram comments as Maia using Haiku."""
import json
import requests
import os
import sys

CREDS_PATH = "/home/andreprado/.openclaw/.secrets/instagram_maia_api.json"
REPLIED_PATH = "/home/andreprado/.openclaw/workspace/moldaspace/memory/replied_comments.json"

def load_creds():
    with open(CREDS_PATH) as f:
        return json.load(f)

def load_replied():
    try:
        with open(REPLIED_PATH) as f:
            return set(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()

def save_replied(replied):
    os.makedirs(os.path.dirname(REPLIED_PATH), exist_ok=True)
    with open(REPLIED_PATH, 'w') as f:
        json.dump(list(replied), f)

def get_maia_reply(comment_text, post_caption):
    """Use Haiku to generate a reply as Maia."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        # Try reading from openclaw config
        try:
            import subprocess
            result = subprocess.run(["openclaw", "auth", "show"], capture_output=True, text=True)
            for line in result.stdout.split("\n"):
                if "ANTHROPIC_API_KEY" in line:
                    api_key = line.split("=", 1)[1].strip()
        except:
            pass
    
    if not api_key:
        # Fallback responses
        lower = comment_text.lower()
        if any(w in lower for w in ["send", "dm", "share"]):
            return "sent!"
        elif any(w in lower for w in ["beautiful", "amazing", "love", "gorgeous", "nice", "wow", "great"]):
            return "thank you 🤍"
        elif "?" in comment_text:
            return "good question, dm me"
        else:
            return "appreciate it 🙏"
    
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-3-5-haiku-latest",
            "max_tokens": 60,
            "system": """You are Maia, a designer who posts interior renders on Instagram (@studio.maia.arch).

Reply to comments like a real person quickly typing on their phone. Rules:
- MAX 1 sentence, usually just a few words
- 0 or 1 emoji max, never at the start
- NO exclamation marks back to back (!!)
- NO phrases like "Great question!", "So glad you asked!", "Absolutely!", "Of course!"
- NO corporate/AI phrases — write how a 28yo designer actually texts
- Don't restate what they said
- If they say "beautiful/love it/amazing": a simple "thank you 🤍" or "glad you like it" is enough
- If they ask a question: give a direct short answer
- If they ask for DM/send: "sent!" or "check your dms"
- If spam/promo: ignore or one word like "thanks"
- Never mention AI, software, or MoldaSpace

Examples of good replies:
- "thank you 🤍"
- "love this style too"
- "japandi all the way"
- "sent!"
- "the lighting took forever to get right lol"
- "warm tones for sure"
- "appreciate it 🙏"

Sound human. Sound tired. Sound like you're replying between meetings.""",
            "messages": [{"role": "user", "content": f"Post: {post_caption[:150]}\nComment: {comment_text}\n\nReply (few words, human, lowercase ok):"}],
        }
    )
    
    if r.ok:
        return r.json()["content"][0]["text"].strip('"')
    return "Thank you! 🤍"

def main():
    creds = load_creds()
    token = creds["page_access_token"]
    ig_id = creds["ig_account_id"]
    replied = load_replied()
    
    # Get recent media
    r = requests.get(f"https://graph.facebook.com/v21.0/{ig_id}/media",
                     params={"fields": "id,caption", "access_token": token, "limit": 10})
    media = r.json().get("data", [])
    
    new_replies = 0
    for post in media:
        post_id = post["id"]
        caption = post.get("caption", "")
        
        # Get comments
        r = requests.get(f"https://graph.facebook.com/v21.0/{post_id}/comments",
                        params={"fields": "id,text,username,timestamp,replies{id}", "access_token": token})
        comments = r.json().get("data", [])
        
        for comment in comments:
            cid = comment["id"]
            
            # Skip if already replied
            if cid in replied:
                continue
            
            # Skip if already has replies (we already responded)
            if comment.get("replies", {}).get("data"):
                replied.add(cid)
                continue
            
            text = comment.get("text", "")
            username = comment.get("username", "unknown")
            
            # Generate reply
            reply = get_maia_reply(text, caption)
            
            # Post reply
            r = requests.post(f"https://graph.facebook.com/v21.0/{cid}/replies",
                            data={"message": reply, "access_token": token})
            
            if r.ok:
                print(f"✅ Replied to @{username}: '{text[:50]}' → '{reply}'")
                replied.add(cid)
                new_replies += 1
            else:
                print(f"❌ Failed to reply to @{username}: {r.json().get('error', {}).get('message', 'unknown')}")
    
    save_replied(replied)
    print(f"\nDone. {new_replies} new replies.")

if __name__ == "__main__":
    main()
