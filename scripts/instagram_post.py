#!/usr/bin/env python3
"""Instagram posting via Meta Graph API.

Usage:
    # Text post with image (required - IG doesn't support text-only)
    python3 instagram_post.py --image "https://example.com/image.jpg" --caption "My post caption"
    
    # Carousel (multiple images)
    python3 instagram_post.py --carousel "url1" "url2" "url3" --caption "Carousel caption"
    
    # Reel (video)
    python3 instagram_post.py --reel "https://example.com/video.mp4" --caption "Reel caption"

Note: Instagram requires media (image or video). Text-only posts are not supported.
      Images must be publicly accessible URLs.
"""

import argparse
import json
import time
import requests
import sys

CREDS_PATH = "/home/andreprado/.openclaw/.secrets/instagram_credentials.json"
API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


def load_creds():
    with open(CREDS_PATH) as f:
        return json.load(f)


def post_image(ig_id, token, image_url, caption):
    """Post a single image."""
    # Step 1: Create media container
    r = requests.post(f"{BASE_URL}/{ig_id}/media", data={
        "image_url": image_url,
        "caption": caption,
        "access_token": token,
    })
    r.raise_for_status()
    container_id = r.json()["id"]
    print(f"Container created: {container_id}")
    
    # Step 2: Publish
    r = requests.post(f"{BASE_URL}/{ig_id}/media_publish", data={
        "creation_id": container_id,
        "access_token": token,
    })
    r.raise_for_status()
    media_id = r.json()["id"]
    print(f"Published! Media ID: {media_id}")
    return media_id


def post_carousel(ig_id, token, image_urls, caption):
    """Post a carousel (2-10 images)."""
    # Step 1: Create containers for each image
    container_ids = []
    for url in image_urls:
        r = requests.post(f"{BASE_URL}/{ig_id}/media", data={
            "image_url": url,
            "is_carousel_item": "true",
            "access_token": token,
        })
        r.raise_for_status()
        container_ids.append(r.json()["id"])
        print(f"Carousel item created: {r.json()['id']}")
    
    # Step 2: Create carousel container
    r = requests.post(f"{BASE_URL}/{ig_id}/media", data={
        "media_type": "CAROUSEL",
        "caption": caption,
        "children": ",".join(container_ids),
        "access_token": token,
    })
    r.raise_for_status()
    carousel_id = r.json()["id"]
    print(f"Carousel container: {carousel_id}")
    
    # Step 3: Publish
    r = requests.post(f"{BASE_URL}/{ig_id}/media_publish", data={
        "creation_id": carousel_id,
        "access_token": token,
    })
    r.raise_for_status()
    media_id = r.json()["id"]
    print(f"Published carousel! Media ID: {media_id}")
    return media_id


def post_reel(ig_id, token, video_url, caption):
    """Post a reel (video)."""
    # Step 1: Create media container
    r = requests.post(f"{BASE_URL}/{ig_id}/media", data={
        "media_type": "REELS",
        "video_url": video_url,
        "caption": caption,
        "access_token": token,
    })
    r.raise_for_status()
    container_id = r.json()["id"]
    print(f"Reel container created: {container_id}")
    
    # Step 2: Wait for processing
    for i in range(30):
        r = requests.get(f"{BASE_URL}/{container_id}", params={
            "fields": "status_code",
            "access_token": token,
        })
        status = r.json().get("status_code")
        print(f"  Processing... ({status})")
        if status == "FINISHED":
            break
        elif status == "ERROR":
            print(f"Error: {r.json()}")
            sys.exit(1)
        time.sleep(10)
    
    # Step 3: Publish
    r = requests.post(f"{BASE_URL}/{ig_id}/media_publish", data={
        "creation_id": container_id,
        "access_token": token,
    })
    r.raise_for_status()
    media_id = r.json()["id"]
    print(f"Published reel! Media ID: {media_id}")
    return media_id


def get_insights(ig_id, token, media_id):
    """Get post insights."""
    r = requests.get(f"{BASE_URL}/{media_id}", params={
        "fields": "like_count,comments_count,timestamp,permalink",
        "access_token": token,
    })
    if r.ok:
        return r.json()
    return None


def main():
    parser = argparse.ArgumentParser(description="Post to Instagram via Graph API")
    parser.add_argument("--image", help="Image URL to post")
    parser.add_argument("--carousel", nargs="+", help="Multiple image URLs for carousel")
    parser.add_argument("--reel", help="Video URL for reel")
    parser.add_argument("--caption", required=True, help="Post caption")
    args = parser.parse_args()
    
    creds = load_creds()
    ig_id = creds["ig_account_id"]
    token = creds["page_access_token"]
    
    if args.reel:
        media_id = post_reel(ig_id, token, args.reel, args.caption)
    elif args.carousel:
        media_id = post_carousel(ig_id, token, args.carousel, args.caption)
    elif args.image:
        media_id = post_image(ig_id, token, args.image, args.caption)
    else:
        print("Error: Provide --image, --carousel, or --reel")
        sys.exit(1)
    
    print(f"\n✅ Posted successfully!")
    print(f"Media ID: {media_id}")
    print(f"Profile: https://instagram.com/{creds['ig_username']}")


if __name__ == "__main__":
    main()
