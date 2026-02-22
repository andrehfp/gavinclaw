# MoldaSpace Reel Pipeline

## Flow
1. **Generate sketch** → KIE API (prompt: pencil sketch of [room type])
2. **Generate render** → KIE API (input: sketch URL + prompt: photorealistic render, keep same layout)
3. **Render video** → Remotion (before/after reveal template)
4. **Post** → Instagram via ig_post_maia.py

## KIE API
- Key: `~/.openclaw/.secrets/kie_api_key`
- Generate: `POST https://api.kie.ai/api/v1/gpt4o-image/generate`
- Poll: `GET https://api.kie.ai/api/v1/gpt4o-image/record-info?taskId=TASK_ID`
- Image-to-image: pass `fileUrls: [sketch_url]` in generate request

## Remotion Project
- Location: `~/Projects/moldaspace-reels/`
- Render: `npx remotion render src/index.ts BeforeAfterReveal out/output.mp4 --codec h264`
- Images go in `public/before.jpg` and `public/after.jpg`
- 1080x1920 (9:16), 30fps, 8 seconds

## Room Types to Cycle
1. Modern living room
2. Scandinavian kitchen
3. Cozy bedroom
4. Industrial home office
5. Luxury bathroom
6. Mid-century dining room
7. Japandi living space
8. Coastal bedroom
9. Art deco entrance
10. Contemporary open kitchen
