#!/usr/bin/env python3
"""Post to Instagram as @studio.maia.arch using instagrapi."""

import sys
import json
from pathlib import Path
from instagrapi import Client

CREDS = json.loads(Path("/home/andreprado/.openclaw/.secrets/instagram_maia.json").read_text())
SESSION_FILE = Path("/home/andreprado/.openclaw/.secrets/instagram_maia_session.json")

def get_client():
    cl = Client()
    cl.delay_range = [1, 3]
    
    if SESSION_FILE.exists():
        try:
            cl.load_settings(SESSION_FILE)
            cl.login(CREDS["username"], CREDS["password"])
            cl.get_timeline_feed()  # test
            print("Logged in from session")
            return cl
        except Exception as e:
            print(f"Session expired: {e}")
    
    cl.login(CREDS["username"], CREDS["password"])
    cl.dump_settings(SESSION_FILE)
    print("Fresh login")
    return cl

def post_single(image_path, caption):
    cl = get_client()
    media = cl.photo_upload(image_path, caption)
    print(f"Posted! Media ID: {media.pk}, URL: https://instagram.com/p/{media.code}/")
    return media

def post_carousel(image_paths, caption):
    cl = get_client()
    media = cl.album_upload(image_paths, caption)
    print(f"Posted carousel! Media ID: {media.pk}, URL: https://instagram.com/p/{media.code}/")
    return media

def post_reel(video_path, caption, thumbnail_path=None):
    cl = get_client()
    kwargs = {"path": video_path, "caption": caption}
    if thumbnail_path:
        kwargs["thumbnail"] = thumbnail_path
    media = cl.clip_upload(**kwargs)
    print(f"Posted reel! Media ID: {media.pk}, URL: https://instagram.com/reel/{media.code}/")
    return media

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", help="Single image path")
    parser.add_argument("--carousel", nargs="+", help="Multiple image paths for carousel")
    parser.add_argument("--reel", help="Video path for reel")
    parser.add_argument("--thumbnail", help="Thumbnail for reel")
    parser.add_argument("--caption", required=True)
    args = parser.parse_args()
    
    if args.reel:
        post_reel(args.reel, args.caption, args.thumbnail)
    elif args.carousel:
        post_carousel(args.carousel, args.caption)
    elif args.image:
        post_single(args.image, args.caption)
    else:
        print("Need --image, --carousel, or --reel")
        sys.exit(1)
