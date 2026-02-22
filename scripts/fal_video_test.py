#!/usr/bin/env python3
"""
fal.ai Image-to-Video Model Comparison Test
Tests 3 models with the same architectural render input.
"""

import fal_client
import os
import sys
import time
import json
import requests

# API key
FAL_KEY = open(os.path.expanduser("~/.openclaw/.secrets/fal_api_key.txt")).read().strip()
os.environ["FAL_KEY"] = FAL_KEY

# Input image - needs to be a public URL
INPUT_IMAGE = None  # Will be set after upload

OUTPUT_DIR = os.path.expanduser("~/.openclaw/workspace/output/fal-video-test")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def upload_to_catbox(filepath):
    """Upload file to catbox.moe and return public URL."""
    print(f"Uploading {filepath} to catbox.moe...")
    with open(filepath, "rb") as f:
        resp = requests.post(
            "https://catbox.moe/user/api.php",
            data={"reqtype": "fileupload"},
            files={"fileToUpload": (os.path.basename(filepath), f)},
        )
    url = resp.text.strip()
    print(f"  → {url}")
    return url

def upload_to_fal(filepath):
    """Upload file to fal storage and return public URL."""
    print(f"Uploading {filepath} to fal storage...")
    url = fal_client.upload_file(filepath)
    print(f"  → {url}")
    return url

def download_video(url, output_path):
    """Download video from URL."""
    print(f"Downloading to {output_path}...")
    resp = requests.get(url, stream=True)
    with open(output_path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  → {size_mb:.1f} MB")

PROMPT = (
    "A slow cinematic camera pan across this modern living room. "
    "The camera glides smoothly from left to right, revealing the space. "
    "Warm golden sunset light streams through the glass doors. "
    "The fireplace flickers gently. Subtle dust particles float in the light. "
    "Photorealistic, architectural visualization, 4K quality."
)

MODELS = {
    "ltx-2-19b": {
        "endpoint": "fal-ai/ltx-2-19b/image-to-video",
        "args": {
            "prompt": PROMPT,
            "num_frames": 121,  # ~5s at 24fps
            "camera_lora": "dolly_right",
            "camera_lora_scale": 0.8,
            "use_multiscale": True,
            "guidance_scale": 5,
        },
        "image_key": "image_url",
        "price_per_sec": 0.003,
    },
    "wan-2.2": {
        "endpoint": "fal-ai/wan/v2.2-a14b/image-to-video",
        "args": {
            "prompt": PROMPT,
            "num_frames": 81,  # 5s at 16fps
            "resolution": "720p",
            "aspect_ratio": "auto",
        },
        "image_key": "image_url",
        "price_per_sec": 0.08,
    },
    "veo-3.1": {
        "endpoint": "fal-ai/veo3.1/reference-to-video",
        "args": {
            "prompt": PROMPT,
            "duration": "8s",
            "aspect_ratio": "16:9",
        },
        "image_key": "image_urls",  # expects a list
        "image_is_list": True,
        "price_per_sec": 0.20,
    },
    "kling-v3-pro": {
        "endpoint": "fal-ai/kling-video/v3/pro/image-to-video",
        "args": {
            "prompt": PROMPT,
            "duration": 5,
        },
        "image_key": "image_url",
        "price_per_sec": 0.224,
    },
}

def test_model(name, config, image_url):
    """Test a single model and return results."""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"Endpoint: {config['endpoint']}")
    print(f"Est. cost: ${config['price_per_sec'] * 5:.2f} (5s)")
    print(f"{'='*60}")

    image_val = [image_url] if config.get("image_is_list") else image_url
    args = {**config["args"], config["image_key"]: image_val}

    start = time.time()
    try:
        # Submit async
        handler = fal_client.submit(config["endpoint"], arguments=args)
        request_id = handler.request_id
        print(f"Request ID: {request_id}")

        # Poll for result
        result = handler.get()
        elapsed = time.time() - start

        print(f"Completed in {elapsed:.1f}s")
        print(f"Result keys: {list(result.keys())}")

        # Extract video URL
        video_url = None
        if "video" in result:
            video_url = result["video"].get("url") if isinstance(result["video"], dict) else result["video"]
        elif "output" in result:
            video_url = result["output"].get("url") if isinstance(result["output"], dict) else result["output"]

        if video_url:
            output_path = os.path.join(OUTPUT_DIR, f"{name}.mp4")
            download_video(video_url, output_path)
            return {
                "status": "success",
                "time": elapsed,
                "video_url": video_url,
                "local_path": output_path,
                "result": {k: str(v)[:200] for k, v in result.items()},
            }
        else:
            print(f"No video URL found in result: {json.dumps(result, indent=2)[:500]}")
            return {
                "status": "no_video",
                "time": elapsed,
                "result": {k: str(v)[:200] for k, v in result.items()},
            }

    except Exception as e:
        elapsed = time.time() - start
        print(f"ERROR after {elapsed:.1f}s: {e}")
        return {"status": "error", "time": elapsed, "error": str(e)}

def main():
    # Upload input image
    input_path = os.path.expanduser(
        "~/.openclaw/workspace/moldaspace/renders/living-render.png"
    )

    # Try fal upload first, fall back to catbox
    try:
        image_url = upload_to_fal(input_path)
    except Exception as e:
        print(f"fal upload failed ({e}), trying catbox...")
        image_url = upload_to_catbox(input_path)

    # Select which models to test
    models_to_test = sys.argv[1:] if len(sys.argv) > 1 else list(MODELS.keys())

    results = {}
    for name in models_to_test:
        if name not in MODELS:
            print(f"Unknown model: {name}. Available: {list(MODELS.keys())}")
            continue
        results[name] = test_model(name, MODELS[name], image_url)

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    for name, r in results.items():
        status = r["status"]
        time_s = r.get("time", 0)
        cost = MODELS[name]["price_per_sec"] * 5
        print(f"  {name}: {status} | {time_s:.0f}s | ~${cost:.2f}")
        if r.get("local_path"):
            print(f"    → {r['local_path']}")

    # Save results
    results_path = os.path.join(OUTPUT_DIR, "results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nResults saved to {results_path}")

if __name__ == "__main__":
    main()
