#!/usr/bin/env python3
"""Generate images via KIE.ai API (Nano Banana 2, GPT Image, etc.)"""
import json, sys, time, urllib.request, urllib.parse, os

API_KEY = open(os.path.expanduser("~/.openclaw/.secrets/kie_api_key")).read().strip()
BASE = "https://api.kie.ai/api/v1"

def _req(method, url, data=None):
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None, headers=headers, method=method)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def generate_nano_banana_2(prompt, output_path, aspect_ratio="1:1", resolution="1K", image_inputs=None):
    """Generate image using Nano Banana 2 via KIE Market API"""
    payload = {
        "model": "nano-banana-2",
        "input": {
            "prompt": prompt,
            "image_input": image_inputs or [],
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "output_format": "png"
        }
    }
    r = _req("POST", f"{BASE}/jobs/createTask", payload)
    if r.get("code") != 200:
        print(f"❌ Create failed: {r}")
        return None
    task_id = r["data"]["taskId"]
    print(f"Task: {task_id} — polling...")

    for i in range(60):
        time.sleep(5)
        r = _req("GET", f"{BASE}/jobs/recordInfo?taskId={task_id}")
        state = r.get("data", {}).get("state", "unknown")
        print(f"  [{i*5}s] {state}")
        if state == "success":
            result = json.loads(r["data"]["resultJson"])
            url = result["resultUrls"][0]
            req2 = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req2) as resp, open(output_path, "wb") as f:
                f.write(resp.read())
            print(f"✅ Saved: {output_path}")
            return output_path
        elif state == "fail":
            print(f"❌ Failed: {r['data'].get('failMsg')}")
            return None
    print("❌ Timeout")
    return None

def generate_gpt_image(prompt, output_path, size="1:1"):
    """Generate image using GPT Image 1 (4o) via KIE"""
    payload = {"size": size, "prompt": prompt}
    r = _req("POST", f"{BASE}/gpt4o-image/generate", payload)
    if r.get("code") != 200:
        print(f"❌ Create failed: {r}")
        return None
    task_id = r["data"]["taskId"]
    print(f"Task: {task_id} — polling...")

    for i in range(60):
        time.sleep(5)
        r = _req("GET", f"{BASE}/gpt4o-image/record-info?taskId={task_id}")
        flag = r.get("data", {}).get("successFlag", 0)
        print(f"  [{i*5}s] flag={flag}")
        if flag == 1:
            url = r["data"]["response"]["resultUrls"][0]
            urllib.request.urlretrieve(url, output_path)
            print(f"✅ Saved: {output_path}")
            return output_path
        elif flag == 2:
            print(f"❌ Failed: {r['data'].get('errorMessage')}")
            return None
    print("❌ Timeout")
    return None

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="nano-banana-2", choices=["nano-banana-2", "nano-banana-pro", "gpt-image"])
    p.add_argument("--prompt", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--aspect", default="1:1")
    p.add_argument("--resolution", default="1K")
    args = p.parse_args()

    if args.model in ("nano-banana-2", "nano-banana-pro"):
        generate_nano_banana_2(args.prompt, args.output, args.aspect, args.resolution)
    else:
        generate_gpt_image(args.prompt, args.output, args.aspect)
