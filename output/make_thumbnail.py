#!/usr/bin/env python3
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1280, 720
out = "/home/andreprado/.openclaw/workspace/output/thumbnail-codex-v4.png"

# --- Background: clean light gradient (white → light blue-gray)
bg = Image.new("RGB", (W, H), "#FFFFFF")
draw = ImageDraw.Draw(bg)

# Subtle gradient via bands
for y in range(H):
    t = y / H
    r = int(245 - t * 20)
    g = int(248 - t * 15)
    b = int(255 - t * 10)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Right panel: soft blue accent block
for y in range(H):
    t = y / H
    r = int(235 - t * 15)
    g = int(243 - t * 10)
    b = int(255)
    draw.rectangle([(640, y), (W, y+1)], fill=(r, g, b))

# --- André's face (left half)
face_path = "/home/andreprado/.openclaw/media/inbound/file_125---37c25e94-8a95-4c7e-a082-5af298e7fdcc.jpg"
face = Image.open(face_path).convert("RGB")

# Crop to portrait ratio and resize to fill left side
fw, fh = face.size
target_h = H
target_w = int(fw * (target_h / fh))
face = face.resize((target_w, target_h), Image.LANCZOS)

# Crop to left half width (~560px)
crop_w = min(560, target_w)
face_cropped = face.crop((0, 0, crop_w, target_h))

# Paste on left
bg.paste(face_cropped, (0, 0))

# --- Subtle vignette blend on edge between photo and right panel
blend_w = 80
for x in range(blend_w):
    alpha = x / blend_w
    col = crop_w - blend_w + x
    for y in range(H):
        t_y = y / H
        br = int(235 - t_y * 15)
        bg_r = int(br * alpha + face_cropped.getpixel((crop_w - blend_w + x, y))[0] * (1 - alpha))
        bg_g = int((243 - t_y * 10) * alpha + face_cropped.getpixel((crop_w - blend_w + x, y))[1] * (1 - alpha))
        bg_b = int(255 * alpha + face_cropped.getpixel((crop_w - blend_w + x, y))[2] * (1 - alpha))
        bg.putpixel((col, y), (bg_r, bg_g, bg_b))

draw = ImageDraw.Draw(bg)

# --- Codex logo (right side, centered vertically top area)
logo_path = "/home/andreprado/.openclaw/media/inbound/file_126---6970c0b4-6aa0-42bf-ac4b-6796383ff122.jpg"
logo = Image.open(logo_path).convert("RGBA")
logo_size = 140
logo = logo.resize((logo_size, logo_size), Image.LANCZOS)
logo_x = 660
logo_y = 80
bg.paste(logo, (logo_x, logo_y), logo if logo.mode == "RGBA" else None)

# --- Fonts (try system fonts, fallback to default)
def get_font(size, bold=False):
    paths = [
        f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'Bold' if bold else ''}.ttf",
        f"/usr/share/fonts/truetype/liberation/LiberationSans-{'Bold' if bold else 'Regular'}.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf" if bold else "/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

font_big = get_font(72, bold=True)
font_med = get_font(52, bold=True)
font_sm = get_font(38, bold=False)
font_tag = get_font(30, bold=False)

# --- Text layout (right side: x=660 to 1280)
right_cx = 960  # center of right panel

# "CODEX" label under logo
draw.text((logo_x + logo_size//2, logo_y + logo_size + 8), "CODEX", fill="#1A1A2E", font=font_sm, anchor="mt")

# Divider line
draw.line([(660, 260), (1260, 260)], fill="#C0C8D8", width=2)

# Main question text
lines = [
    ("vai", font_sm, "#555577"),
    ("DESTRONAR", font_big, "#1A1AFF"),
    ("o Claude Code?", font_med, "#1A1A2E"),
]
y_cursor = 285
for text, font, color in lines:
    draw.text((right_cx, y_cursor), text, fill=color, font=font, anchor="mt")
    bbox = draw.textbbox((0, 0), text, font=font)
    y_cursor += (bbox[3] - bbox[1]) + 12

# Tagline
draw.line([(660, 540), (1260, 540)], fill="#C0C8D8", width=2)
draw.text((right_cx, 558), "@andrefprado", fill="#8899AA", font=font_tag, anchor="mt")

# --- Save
bg.save(out, quality=95)
print(f"Saved: {out}")
