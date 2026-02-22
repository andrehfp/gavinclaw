#!/usr/bin/env python3
"""Generate sketch-to-render transition video using Wan 2.2 (fast) via fal.ai"""
import fal_client, os, requests, time, sys

os.environ['FAL_KEY'] = open(os.path.expanduser('~/.openclaw/.secrets/fal_api_key.txt')).read().strip()

sketch_path = sys.argv[1] if len(sys.argv) > 1 else 'out/maia-reel-sketch.png'
render_path = sys.argv[2] if len(sys.argv) > 2 else 'out/maia-reel-render.png'
output_path = sys.argv[3] if len(sys.argv) > 3 else 'out/maia-reel-test/transition-wan.mp4'

print(f'Uploading sketch: {sketch_path}')
sketch_url = fal_client.upload_file(sketch_path)
print(f'Uploading render: {render_path}')
render_url = fal_client.upload_file(render_path)

prompt = """A hand-drawn architectural sketch of a modern living room smoothly transforms into a photorealistic interior render. Pencil lines gradually fill with color, texture and warm materials. Wooden floors gain rich grain, walls become warm plaster, furniture fills with fabric. Golden sunset light appears through floor-to-ceiling windows revealing ocean view. Cinematic smooth transformation from drawing to reality."""

# Try Kling standard (faster than Pro) with start+end frame
print('Submitting to Kling v2.1 standard (faster)...')
start = time.time()
handler = fal_client.submit('fal-ai/kling-video/v2.1/standard/image-to-video', arguments={
    'image_url': sketch_url,
    'end_image_url': render_url,
    'prompt': prompt,
    'duration': 5,
})
print(f'Request ID: {handler.request_id}')

while True:
    elapsed = time.time() - start
    try:
        result = handler.get(timeout=5)
        break
    except Exception as e:
        status = handler.status(with_logs=False)
        print(f'  [{elapsed:.0f}s] {status}')
        if elapsed > 300:
            print('Timeout!')
            sys.exit(1)
        time.sleep(8)

elapsed = time.time() - start
print(f'Done in {elapsed:.0f}s')

video_url = result['video']['url'] if isinstance(result['video'], dict) else result['video']
print(f'Video URL: {video_url}')

os.makedirs(os.path.dirname(output_path), exist_ok=True)
resp = requests.get(video_url, stream=True)
with open(output_path, 'wb') as f:
    for chunk in resp.iter_content(8192):
        f.write(chunk)

size_mb = os.path.getsize(output_path) / 1024 / 1024
print(f'Saved: {output_path} ({size_mb:.1f} MB)')
print(f'MEDIA: {os.path.abspath(output_path)}')
