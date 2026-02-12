#!/usr/bin/env python3
"""
generate_pdf.py - Print-ready children's book PDF generator.

Generates a PDF children's book from a JSON spec with:
- Full-bleed cover page with title/child name overlay
- Story pages with illustration + text
- Back cover
- Pages padded to multiple of 4

Supports both standard print (CMYK, 21x21cm) and Lulu (RGB, 8.5x8.5in) formats.

Usage:
    python generate_pdf.py book.json
    python generate_pdf.py book.json --lulu
    python generate_pdf.py book.json -o output.pdf
"""

import argparse
import json
import math
import os
import sys

from reportlab.lib.units import mm, inch, cm
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import Color, white, black, CMYKColor
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DPI = 300
DEFAULT_SIZE_CM = 21
DEFAULT_BLEED_MM = 3


def parse_size(size_str: str) -> tuple[float, float]:
    """Parse size string like '21x21cm' into (width_pt, height_pt)."""
    size_str = size_str.lower().strip()
    if size_str.endswith("cm"):
        parts = size_str[:-2].split("x")
        w, h = float(parts[0]), float(parts[1])
        return w * cm, h * cm
    elif size_str.endswith("in"):
        parts = size_str[:-2].split("x")
        w, h = float(parts[0]), float(parts[1])
        return w * inch, h * inch
    elif size_str.endswith("mm"):
        parts = size_str[:-2].split("x")
        w, h = float(parts[0]), float(parts[1])
        return w * mm, h * mm
    else:
        parts = size_str.split("x")
        w, h = float(parts[0]), float(parts[1])
        return w * cm, h * cm


def register_fonts():
    """Register fonts, falling back to Helvetica if custom fonts unavailable."""
    # Try common paths for a nice serif/display font
    font_paths = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "BookTitle"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf", "BookBody"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "BookSans"),
    ]
    registered = {}
    for path, name in font_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                registered[name] = True
            except Exception:
                pass
    return registered


def draw_image_full_bleed(c: canvas.Canvas, image_path: str, page_w: float, page_h: float):
    """Draw an image scaled to fill the entire page (full bleed, center-crop)."""
    if not os.path.exists(image_path):
        # Draw placeholder
        c.setFillColor(CMYKColor(0.05, 0.02, 0, 0.1))
        c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
        c.setFillColor(CMYKColor(0, 0, 0, 0.3))
        c.setFont("Helvetica", 14)
        c.drawCentredString(page_w / 2, page_h / 2, f"[Image: {os.path.basename(image_path)}]")
        return

    try:
        img = ImageReader(image_path)
        iw, ih = img.getSize()
        # Scale to fit within page (contain), then center
        scale = min(page_w / iw, page_h / ih)
        draw_w = iw * scale
        draw_h = ih * scale
        x = (page_w - draw_w) / 2
        y = (page_h - draw_h) / 2
        # Fill background with white first
        c.setFillColor(white)
        c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
        c.drawImage(img, x, y, draw_w, draw_h, preserveAspectRatio=True)
    except Exception as e:
        # Fallback placeholder on error
        c.setFillColor(CMYKColor(0.05, 0.02, 0, 0.1))
        c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
        c.setFillColor(CMYKColor(0, 0, 0, 0.5))
        c.setFont("Helvetica", 10)
        c.drawCentredString(page_w / 2, page_h / 2, f"[Error loading: {e}]")


def draw_text_overlay(c: canvas.Canvas, text: str, x: float, y: float,
                      font: str, size: float, color, max_width: float = None,
                      align: str = "center"):
    """Draw text with optional shadow for readability over images."""
    c.saveState()
    # Shadow
    c.setFillColor(Color(0, 0, 0, alpha=0.5))
    c.setFont(font, size)
    if align == "center":
        c.drawCentredString(x + 1.5, y - 1.5, text)
    else:
        c.drawString(x + 1.5, y - 1.5, text)
    # Main text
    c.setFillColor(color)
    if align == "center":
        c.drawCentredString(x, y, text)
    else:
        c.drawString(x, y, text)
    c.restoreState()


def wrap_text(text: str, font: str, font_size: float, max_width: float) -> list[str]:
    """Simple word-wrap for text within max_width."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if stringWidth(test, font, font_size) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def make_cover(c: canvas.Canvas, book: dict, page_w: float, page_h: float, bleed: float, is_lulu: bool):
    """Generate the cover page. Title is baked into the AI-generated cover image."""
    # Just draw the cover image full page — title is already in the image
    pages = book.get("pages", [])
    if pages and pages[0].get("image_path"):
        draw_image_full_bleed(c, pages[0]["image_path"], page_w, page_h)
    else:
        c.setFillColor(CMYKColor(0.6, 0.1, 0, 0.05) if not is_lulu else Color(0.3, 0.5, 0.9))
        c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    c.showPage()


def make_story_page(c: canvas.Canvas, page_data: dict, page_w: float, page_h: float,
                    bleed: float, is_lulu: bool):
    """Generate a story page with illustration and text."""
    trim_w = page_w - 2 * bleed
    trim_h = page_h - 2 * bleed

    image_path = page_data.get("image_path", "")
    text = page_data.get("text", "")

    # Layout: image takes top portion, text overlaid at bottom with semi-transparent bg
    # White background first
    c.setFillColor(white)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    # Draw image scaled to FIT (contain) the full page
    if image_path and os.path.exists(image_path):
        try:
            img = ImageReader(image_path)
            iw, ih = img.getSize()
            scale = min(page_w / iw, page_h / ih)
            dw, dh = iw * scale, ih * scale
            x = (page_w - dw) / 2
            y = (page_h - dh) / 2
            c.drawImage(img, x, y, dw, dh, preserveAspectRatio=True)
        except Exception:
            pass
    elif image_path:
        c.setFillColor(CMYKColor(0.02, 0.02, 0, 0.05) if not is_lulu else Color(0.95, 0.95, 0.98))
        c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    # Text area: semi-transparent bar at bottom
    if text:
        body_font = "BookBody" if "BookBody" in pdfmetrics.getRegisteredFontNames() else "Helvetica"
        font_size = trim_w * 0.035
        font_size = max(11, min(font_size, 18))
        margin = bleed + trim_w * 0.08
        max_text_w = page_w - 2 * margin
        lines = wrap_text(text, body_font, font_size, max_text_w)
        line_height = font_size * 1.5
        total_text_h = len(lines) * line_height
        text_box_h = total_text_h + line_height * 1.5  # padding

        # Semi-transparent white background for text
        c.saveState()
        c.setFillColor(Color(1, 1, 1, alpha=0.85))
        c.roundRect(margin * 0.5, bleed, page_w - margin, text_box_h, 10, fill=1, stroke=0)
        c.restoreState()

        start_y = bleed + text_box_h - line_height

        text_color = CMYKColor(0, 0, 0, 0.85) if not is_lulu else Color(0.15, 0.15, 0.15)
        c.setFillColor(text_color)
        c.setFont(body_font, font_size)
        for i, line in enumerate(lines):
            y = start_y - i * line_height
            c.drawCentredString(page_w / 2, y, line)

    c.showPage()


def make_back_cover(c: canvas.Canvas, book: dict, page_w: float, page_h: float,
                    bleed: float, is_lulu: bool):
    """Generate back cover."""
    # Solid background
    c.setFillColor(CMYKColor(0.6, 0.1, 0, 0.05) if not is_lulu else Color(0.3, 0.5, 0.9))
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    cx = page_w / 2
    font = "BookSans" if "BookSans" in pdfmetrics.getRegisteredFontNames() else "Helvetica"

    # "Made with ❤️ and AI"
    c.setFillColor(white)
    c.setFont(font, 14)
    c.drawCentredString(cx, page_h * 0.52, "Made with ❤️ and AI")

    # Child name dedication
    child_name = book.get("child_name", "")
    if child_name:
        c.setFont(font, 11)
        c.drawCentredString(cx, page_h * 0.45, f"Especialmente para {child_name}")

    # Title small
    title = book.get("title", "")
    if title:
        c.setFont(font, 9)
        c.setFillColor(Color(1, 1, 1, alpha=0.7))
        c.drawCentredString(cx, bleed + 15, title)

    c.showPage()


def make_blank_page(c: canvas.Canvas, page_w: float, page_h: float, is_lulu: bool):
    """Generate a blank page for padding."""
    c.setFillColor(white)
    c.rect(0, 0, page_w, page_h, fill=1, stroke=0)
    c.showPage()


def generate_book(book: dict, is_lulu: bool = False):
    """
    Main function: generate the PDF from a book dict.

    Args:
        book: Dictionary with title, author, child_name, pages, output_path, etc.
        is_lulu: If True, generate Lulu-compatible (RGB, 8.5x8.5in) variant.
    """
    register_fonts()

    # Parse dimensions
    if is_lulu:
        page_w, page_h = 8.5 * inch, 8.5 * inch
        bleed = 0.125 * inch  # Lulu standard bleed
        total_w = page_w + 2 * bleed
        total_h = page_h + 2 * bleed
    else:
        size_str = book.get("size", "21x21cm")
        page_w, page_h = parse_size(size_str)
        bleed_mm_val = book.get("bleed_mm", DEFAULT_BLEED_MM)
        bleed = bleed_mm_val * mm
        total_w = page_w + 2 * bleed
        total_h = page_h + 2 * bleed

    # Output path
    output_path = book.get("output_path", "book.pdf")
    if is_lulu and not output_path.endswith("_lulu.pdf"):
        base, ext = os.path.splitext(output_path)
        output_path = f"{base}_lulu{ext}"

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # Create canvas
    c = canvas.Canvas(output_path, pagesize=(total_w, total_h))
    c.setAuthor(book.get("author", ""))
    c.setTitle(book.get("title", ""))
    c.setSubject(f"Children's book for {book.get('child_name', '')}")

    # --- Page 1: Cover ---
    make_cover(c, book, total_w, total_h, bleed, is_lulu)

    # --- Pages 2 to N-1: Story pages ---
    pages = book.get("pages", [])
    # Skip first page data if used as cover image
    story_pages = pages[1:] if len(pages) > 1 else pages
    for page_data in story_pages:
        make_story_page(c, page_data, total_w, total_h, bleed, is_lulu)

    # --- Last page: Back cover ---
    make_back_cover(c, book, total_w, total_h, bleed, is_lulu)

    # --- Pad to multiple of 4 ---
    # Count: 1 (cover) + len(story_pages) + 1 (back cover)
    total_pages = 1 + len(story_pages) + 1
    remainder = total_pages % 4
    if remainder != 0:
        blanks_needed = 4 - remainder
        for _ in range(blanks_needed):
            make_blank_page(c, total_w, total_h, is_lulu)
        total_pages += blanks_needed

    c.save()

    fmt = "Lulu (RGB, 8.5×8.5in)" if is_lulu else f"Print ({book.get('size', '21x21cm')}, CMYK)"
    print(f"✅ Generated: {output_path}")
    print(f"   Format: {fmt}")
    print(f"   Pages: {total_pages} (padded to multiple of 4)")
    print(f"   Bleed: {bleed / mm:.1f}mm")
    print(f"   Page size (with bleed): {total_w / mm:.1f} × {total_h / mm:.1f} mm")

    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="Generate a print-ready children's book PDF from a JSON spec.",
        epilog="Example: python generate_pdf.py book.json --lulu",
    )
    parser.add_argument("json_file", help="Path to book JSON file")
    parser.add_argument("-o", "--output", help="Override output path")
    parser.add_argument("--lulu", action="store_true",
                        help="Generate Lulu-compatible variant (RGB, 8.5×8.5in)")
    parser.add_argument("--size", help="Override page size (e.g. '21x21cm', '8.5x8.5in')")
    parser.add_argument("--bleed", type=float, help="Override bleed in mm")

    args = parser.parse_args()

    with open(args.json_file, "r", encoding="utf-8") as f:
        book = json.load(f)

    if args.output:
        book["output_path"] = args.output
    if args.size:
        book["size"] = args.size
    if args.bleed is not None:
        book["bleed_mm"] = args.bleed

    generate_book(book, is_lulu=args.lulu)


if __name__ == "__main__":
    main()
