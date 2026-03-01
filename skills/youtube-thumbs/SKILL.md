---
name: youtube-thumbs
description: >
  Generate YouTube thumbnail variations using Gemini 3 Pro Image.
  Use when: user wants YouTube thumbnails, thumbnail ideas for a video, or visual variations for A/B testing thumbnails.
  Don't use when: user wants generic image generation (use nano-banana-pro directly), social media graphics, or non-YouTube visuals. Not for editing existing thumbnails.
  Outputs: 2 thumbnail image variations (1280x720) saved to disk.
metadata:
  openclaw:
    emoji: "🎨"
    requires:
      bins: ["uv"]
      env: ["GEMINI_API_KEY"]
---

# YouTube Thumbs 🎨

⚠️ Status operacional: **PAUSADO** por decisão do André (Feb/2026). Só usar se ele pedir explicitamente para reativar.

Generate YouTube thumbnail variations for André's channel.

## Workflow

1. **User sends video title** → discuss thumbnail ideas (composition, colors, text)
2. **User optionally sends reference images** → save to `references/`
3. **Generate 2 variations** (or more if requested)

## Generation

```bash
uv run {baseDir}/scripts/generate_thumb.py \
  --prompt "thumbnail description" \
  --title "VIDEO TITLE TEXT" \
  --filename "thumb_1.png" \
  --resolution 2K \
  -i reference1.png -i reference2.png
```

**Parameters:**
- `--prompt` - Detailed description of the thumbnail composition
- `--title` - The text that should appear on the thumbnail (optional, model will try to render it)
- `--filename` - Output filename
- `--resolution` - 1K (default), 2K, or 4K
- `-i` - Reference images (André's face, previous thumbs, style refs)

## ⚠️ CRITICAL RULE: André's Face

**NEVER alter André's face, expression, or features.** Use the reference photos AS-IS. Do not:
- Change facial expressions
- Modify features to look "more excited" or "more surprised"
- Make it look forced or unnatural
- Apply filters or stylization to his face

The reference photos already have natural expressions. Use them unchanged. Compose the thumbnail AROUND his real face.

## André's Channel Style

- Tech/automation/AI content (N8N, SaaS, AI agents)
- Portuguese titles
- Clean, modern look
- Strong contrast, readable text
- André's face often appears

## Reference Images

Store reference images (André's face, style examples) in:
`{baseDir}/references/`

## Tips for Good Prompts

- Be specific about composition: "André on the left looking excited, large bold text on the right"
- Mention colors: "dark blue gradient background with neon green accents"
- Describe emotion: "surprised expression, mouth slightly open"
- Specify text placement: "large white bold text centered saying 'TITULO'"
- Reference style: "similar to MrBeast thumbnail style" or "minimalist tech thumbnail"

## Output

- Resolution: 1280x720 (YouTube standard) — generated at 2K then model crops
- Format: PNG
- Location: workspace `shorts_output/thumbs/`
