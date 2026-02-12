# Kids Book PDF Generator 📚

Generate print-ready children's book PDFs from a JSON specification.

## Setup

```bash
pip install reportlab
# or
uv pip install reportlab
```

## Usage

```bash
# Standard print format (21x21cm, CMYK, 3mm bleed)
python generate_pdf.py sample_book.json

# Lulu-compatible (8.5x8.5in, RGB)
python generate_pdf.py sample_book.json --lulu

# Custom output path
python generate_pdf.py sample_book.json -o my_book.pdf

# Custom size and bleed
python generate_pdf.py sample_book.json --size 20x20cm --bleed 5
```

## JSON Format

```json
{
  "title": "Book Title",
  "author": "Author Name",
  "child_name": "Child's Name",
  "size": "21x21cm",
  "bleed_mm": 3,
  "output_path": "output/book.pdf",
  "pages": [
    {"image_path": "images/cover.png", "text": ""},
    {"image_path": "images/page1.png", "text": "Story text for page 1."},
    {"image_path": "images/page2.png", "text": "Story text for page 2."}
  ]
}
```

- **First page** → used as cover image
- **Last page** → auto-generated back cover ("Made with ❤️ and AI")
- **Padding** → blank pages added to reach a multiple of 4

## Output Specs

| Feature | Standard | Lulu |
|---------|----------|------|
| Size | 21×21cm (configurable) | 8.5×8.5in |
| Bleed | 3mm (configurable) | 0.125in |
| Color | CMYK | RGB |
| Fonts | Embedded | Embedded |

## Programmatic Use

```python
from generate_pdf import generate_book

book = {
    "title": "My Story",
    "child_name": "Sofia",
    "author": "AI",
    "output_path": "sofia_book.pdf",
    "pages": [
        {"image_path": "cover.png", "text": ""},
        {"image_path": "p1.png", "text": "Once upon a time..."},
    ]
}
generate_book(book)           # Standard print
generate_book(book, is_lulu=True)  # Lulu format
```
