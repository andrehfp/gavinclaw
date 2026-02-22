#!/usr/bin/env python3
"""
MoldaSpace Reel Generator
Generates before/after interior design reels using KIE API + Remotion.

Usage:
    python3 scripts/moldaspace_reel.py "modern living room" --output out/reel-living.mp4
    python3 scripts/moldaspace_reel.py "scandinavian kitchen" --sketch-prompt "custom sketch prompt"
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

API_URL = "https://api.kie.ai/api/v1/gpt4o-image/generate"
STATUS_URL = "https://api.kie.ai/api/v1/gpt4o-image/record-info"
# Nano Banana Pro (same model MoldaSpace uses)
NBP_CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
NBP_STATUS_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"
KEY_FILE = os.path.expanduser("~/.openclaw/.secrets/kie_api_key")
REMOTION_DIR = os.path.expanduser("~/Projects/moldaspace-reels")

def get_api_key():
    with open(KEY_FILE) as f:
        return f.read().strip()

def kie_generate(prompt, file_urls=None, size="2:3"):
    key = get_api_key()
    body = {"size": size, "prompt": prompt}
    if file_urls:
        body["fileUrls"] = file_urls
    
    data = json.dumps(body).encode()
    req = urllib.request.Request(API_URL, data=data, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    resp = json.loads(urllib.request.urlopen(req).read())
    task_id = resp["data"]["taskId"]
    print(f"  Task: {task_id}")
    return task_id

def kie_poll(task_id, timeout=120):
    key = get_api_key()
    start = time.time()
    while time.time() - start < timeout:
        url = f"{STATUS_URL}?taskId={task_id}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        resp = json.loads(urllib.request.urlopen(req).read())
        data = resp.get("data", {})
        status = data.get("status", "")
        if status == "SUCCESS":
            urls = data.get("response", {}).get("resultUrls", [])
            return urls[0] if urls else None
        elif status in ("FAILED", "ERROR"):
            print(f"  FAILED: {data.get('errorMessage', 'unknown')}")
            return None
        print(f"  Status: {status}...")
        time.sleep(10)
    print("  TIMEOUT")
    return None

def nbp_generate(prompt, image_urls=None, resolution="2K"):
    """Generate image using Nano Banana Pro (same model as MoldaSpace app)."""
    key = get_api_key()
    body = {
        "model": "nano-banana-pro",
        "input": {
            "prompt": prompt + " Output a high-definition, photorealistic image with sharp details and professional quality.",
            "image_input": image_urls or [],
            "resolution": resolution,
            "output_format": "png",
        },
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(NBP_CREATE_URL, data=data, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    resp = json.loads(urllib.request.urlopen(req).read())
    task_id = resp["data"]["taskId"]
    print(f"  Task (NBP): {task_id}")
    return task_id

def nbp_poll(task_id, timeout=120):
    """Poll Nano Banana Pro task status."""
    key = get_api_key()
    start = time.time()
    while time.time() - start < timeout:
        url = f"{NBP_STATUS_URL}?taskId={task_id}"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}"})
        resp = json.loads(urllib.request.urlopen(req).read())
        data = resp.get("data", {})
        state = data.get("state", "")
        if state == "success":
            result_json = data.get("resultJson", "{}")
            result = json.loads(result_json)
            urls = result.get("resultUrls", result.get("result_urls", []))
            return urls[0] if urls else None
        elif state == "fail":
            print(f"  FAILED: {data.get('failMsg', 'unknown')}")
            return None
        print(f"  Status: {state}...")
        time.sleep(5)
    print("  TIMEOUT")
    return None

def download(url, path):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(path, "wb") as f:
        f.write(resp.read())
    print(f"  Downloaded: {path} ({os.path.getsize(path)//1024}KB)")

def render_reel(output_path):
    cmd = [
        "npx", "remotion", "render", "src/index.ts", "BeforeAfterReveal",
        output_path, "--codec", "h264",
    ]
    print(f"  Rendering video...")
    result = subprocess.run(cmd, cwd=REMOTION_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  Render FAILED: {result.stderr[-500:]}")
        return False
    size_mb = os.path.getsize(os.path.join(REMOTION_DIR, output_path)) / 1024 / 1024
    print(f"  Rendered: {output_path} ({size_mb:.1f}MB)")
    return True

def main():
    parser = argparse.ArgumentParser(description="Generate MoldaSpace before/after reel")
    parser.add_argument("room", help="Room type (e.g. 'modern living room')")
    parser.add_argument("--output", "-o", default="out/reel.mp4", help="Output path (relative to remotion dir)")
    parser.add_argument("--sketch-prompt", help="Custom sketch prompt")
    parser.add_argument("--render-prompt", help="Custom render prompt")
    parser.add_argument("--landscape", action="store_true", help="Generate landscape (default is portrait 9:16)")
    args = parser.parse_args()

    orientation = "portrait 9:16 vertical aspect ratio, tall format" if not args.landscape else "landscape 16:9 horizontal"
    
    sketch_prompt = args.sketch_prompt or (
        f"SketchUp 3D model screenshot of a {args.room}, "
        f"{orientation}, "
        f"clean 3D wireframe style, SketchUp default white/grey materials, "
        f"no textures, flat white walls, grey furniture outlines, "
        f"architectural 3D software look, perspective view, white background, "
        f"professional interior architecture software screenshot"
    )
    
    render_prompt = args.render_prompt or (
        f"Convert this SketchUp 3D model into a photorealistic architectural render. "
        f"CRITICAL: maintain the EXACT same room layout, furniture placement, wall positions, "
        f"camera angle, and perspective from the 3D model. Do not add or remove any furniture. "
        f"Do not change the room shape or proportions. Only add realistic materials, textures, "
        f"lighting, and colors to the existing 3D elements. "
        f"{orientation}, "
        f"{args.room.title()}, warm natural lighting, professional architectural visualization, "
        f"8K quality, editorial interior photography."
    )

    print(f"\n🎬 MoldaSpace Reel: {args.room}")
    
    # Step 1: Generate sketch using Nano Banana Pro
    print("\n1️⃣ Generating sketch (Nano Banana Pro)...")
    sketch_task = nbp_generate(sketch_prompt)
    sketch_url = nbp_poll(sketch_task, timeout=180)
    if not sketch_url:
        sys.exit(1)
    
    sketch_path = os.path.join(REMOTION_DIR, "public", "before.jpg")
    download(sketch_url, sketch_path)

    # Step 2: Generate render from sketch using Nano Banana Pro (same as MoldaSpace app)
    print("\n2️⃣ Generating render from sketch (Nano Banana Pro)...")
    render_task = nbp_generate(render_prompt, image_urls=[sketch_url])
    render_url = nbp_poll(render_task, timeout=180)
    if not render_url:
        sys.exit(1)
    
    render_path = os.path.join(REMOTION_DIR, "public", "after.jpg")
    download(render_url, render_path)

    # Step 3: Render video
    print("\n3️⃣ Rendering Reel...")
    if not render_reel(args.output):
        sys.exit(1)

    final_path = os.path.join(REMOTION_DIR, args.output)
    print(f"\n✅ Done! {final_path}")
    return final_path

if __name__ == "__main__":
    main()
