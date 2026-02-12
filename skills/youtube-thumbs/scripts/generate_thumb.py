#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-genai>=1.0.0",
#     "pillow>=10.0.0",
# ]
# ///
"""
Generate YouTube thumbnails using Gemini 3 Pro Image.

Usage:
    uv run generate_thumb.py --prompt "description" --title "VIDEO TITLE" --filename "thumb.png" [-i ref.png]
"""

import argparse
import os
import sys
from pathlib import Path


def get_api_key(provided_key: str | None) -> str | None:
    if provided_key:
        return provided_key
    return os.environ.get("GEMINI_API_KEY")


def main():
    parser = argparse.ArgumentParser(description="Generate YouTube thumbnails")
    parser.add_argument("--prompt", "-p", required=True, help="Thumbnail description")
    parser.add_argument("--title", "-t", default="", help="Text to render on thumbnail")
    parser.add_argument("--filename", "-f", required=True, help="Output filename")
    parser.add_argument("--input-image", "-i", action="append", dest="input_images", metavar="IMAGE",
                        help="Reference images (up to 14)")
    parser.add_argument("--resolution", "-r", choices=["1K", "2K", "4K"], default="2K",
                        help="Output resolution (default: 2K)")
    parser.add_argument("--api-key", "-k", help="Gemini API key")

    args = parser.parse_args()

    api_key = get_api_key(args.api_key)
    if not api_key:
        print("Error: No API key. Set GEMINI_API_KEY or use --api-key", file=sys.stderr)
        sys.exit(1)

    from google import genai
    from google.genai import types
    from PIL import Image as PILImage

    client = genai.Client(api_key=api_key)

    output_path = Path(args.filename)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build the prompt for YouTube thumbnail
    thumb_prompt = f"""Generate a YouTube thumbnail image (16:9 aspect ratio, 1280x720 style).

{args.prompt}

{"The thumbnail should include the text: " + args.title if args.title else ""}

Style requirements:
- High contrast, eye-catching colors
- Professional YouTube thumbnail look
- Bold, readable text if text is included
- Clean composition that works at small sizes
- 16:9 aspect ratio"""

    # Load reference images
    input_images = []
    if args.input_images:
        if len(args.input_images) > 14:
            print(f"Error: Max 14 input images", file=sys.stderr)
            sys.exit(1)
        for img_path in args.input_images:
            try:
                img = PILImage.open(img_path)
                input_images.append(img)
                print(f"Loaded reference: {img_path}")
            except Exception as e:
                print(f"Error loading '{img_path}': {e}", file=sys.stderr)
                sys.exit(1)

    if input_images:
        contents = [*input_images, thumb_prompt]
    else:
        contents = thumb_prompt

    print(f"Generating thumbnail at {args.resolution}...")

    try:
        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
                image_config=types.ImageConfig(image_size=args.resolution)
            )
        )

        image_saved = False
        for part in response.parts:
            if part.text is not None:
                print(f"Model: {part.text}")
            elif part.inline_data is not None:
                from io import BytesIO
                image_data = part.inline_data.data
                if isinstance(image_data, str):
                    import base64
                    image_data = base64.b64decode(image_data)

                image = PILImage.open(BytesIO(image_data))

                if image.mode == 'RGBA':
                    rgb = PILImage.new('RGB', image.size, (255, 255, 255))
                    rgb.paste(image, mask=image.split()[3])
                    rgb.save(str(output_path), 'PNG')
                elif image.mode == 'RGB':
                    image.save(str(output_path), 'PNG')
                else:
                    image.convert('RGB').save(str(output_path), 'PNG')
                image_saved = True

        if image_saved:
            full_path = output_path.resolve()
            print(f"\nThumbnail saved: {full_path}")
            print(f"MEDIA: {full_path}")
        else:
            print("Error: No image generated", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
