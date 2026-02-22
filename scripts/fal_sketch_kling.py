#!/usr/bin/env python3
import fal_client, os, requests, time

os.environ['FAL_KEY'] = open(os.path.expanduser('~/.openclaw/.secrets/fal_api_key.txt')).read().strip()

sketch_url = fal_client.upload_file('moldaspace/renders/bedroom-sketch.png')
render_url = fal_client.upload_file('moldaspace/renders/bedroom-render.png')
print(f'sketch: {sketch_url}')
print(f'render: {render_url}')

prompt = 'A black and white architectural sketch smoothly transforms into a photorealistic interior render. Pencil lines gradually fill with color, texture and warm materials. Wooden floors gain rich grain, walls become smooth plaster, the bed fills with soft linen bedding. Golden sunset light gradually appears through sheer curtains. Smooth organic transformation from drawing to reality. Cinematic, architectural visualization.'

print('Submitting to Kling v3 Pro...')
start = time.time()
handler = fal_client.submit('fal-ai/kling-video/v3/pro/image-to-video', arguments={
    'image_url': sketch_url,
    'end_image_url': render_url,
    'prompt': prompt,
    'duration': 5,
})
print(f'Request: {handler.request_id}')
result = handler.get()
elapsed = time.time() - start
print(f'Done in {elapsed:.0f}s')

video_url = result['video']['url'] if isinstance(result['video'], dict) else result['video']
out = 'output/fal-video-test/kling-sketch-to-render.mp4'
resp = requests.get(video_url, stream=True)
with open(out, 'wb') as f:
    for chunk in resp.iter_content(8192):
        f.write(chunk)
print(f'Saved: {out} ({os.path.getsize(out)/1024/1024:.1f} MB)')
