#!/usr/bin/env python3
"""Post to Twitter/X using the API"""
import json
import sys
import tweepy

CREDS_PATH = "/home/andreprado/.openclaw/.secrets/twitter_credentials.json"

def post_tweet(text: str):
    with open(CREDS_PATH) as f:
        creds = json.load(f)

    client = tweepy.Client(
        consumer_key=creds["api_key"],
        consumer_secret=creds["api_key_secret"],
        access_token=creds["access_token"],
        access_token_secret=creds["access_token_secret"],
    )

    try:
        response = client.create_tweet(text=text)
        tweet_id = response.data["id"]
        print(f"✅ Tweeted! ID: {tweet_id}")
        print(f"   https://x.com/i/status/{tweet_id}")
        return response
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 twitter_post.py 'Your tweet text'")
        sys.exit(1)
    post_tweet(sys.argv[1])
