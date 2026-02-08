---
name: viralclaw
description: Generate viral shorts from long videos with AI captions via the ViralClaw API.
metadata:
  openclaw:
    emoji: "🎬"
    requires:
      bins: ["curl", "python3"]
    config:
      - key: viralclaw.api_url
        description: "ViralClaw API URL"
        default: "https://api.viral-claw.com"
      - key: viralclaw.api_key
        description: "Your ViralClaw API key"
        required: true
---

# ViralClaw 🎬

Generate viral shorts from long videos with AI-powered captions.

## Setup

```bash
openclaw config set viralclaw.api_key YOUR_API_KEY
```

## Commands

### Generate Shorts
```bash
python3 scripts/generate_shorts.py VIDEO_URL --count 3 --style hormozi --language pt --wait
```

**Parameters:**
- `VIDEO_URL` - YouTube URL or direct video link (required)
- `--count N` - How many shorts to generate (1-10, default: 3)
- `--style STYLE` - Caption style (default: hormozi)
- `--language LANG` - Transcription language (default: pt)
- `--wait` - Wait for completion (recommended)
- `--json` - JSON output

**Styles:** `hormozi`, `mrbeast`, `ali_abdaal`, `iman_gadzhi`, `garyvee`

### Add Captions
```bash
python3 scripts/add_captions.py VIDEO_URL --style hormozi --language pt --wait
```

Adds viral captions to a full video (no clipping).

### Detect Moments
```bash
python3 scripts/detect_moments.py VIDEO_URL --count 5
```

Detect the best viral moments (no video processing).

### Check Credits
```bash
python3 scripts/check_credits.py
```

## Output Format

- **Resolution:** 1080x1920 (vertical)
- **Layout:** 60% content on top, 40% speaker on bottom
- **Captions:** Viral-style with keyword highlights

## Pricing

- 3 free minutes on signup
- $29 for 200 credits (1 credit = 1 minute, never expire)

## Links

- **API**: https://api.viral-claw.com
- **Docs**: https://viral-claw.com
