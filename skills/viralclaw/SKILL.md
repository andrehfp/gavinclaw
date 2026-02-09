---
name: viralclaw
description: Repurpose long videos into shorts, carousels, threads, quote cards, and audiograms via the ViralClaw API.
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

One video in, infinite content out. Repurpose any long-form video into 6 formats with one API call.

## Setup

```bash
openclaw config set viralclaw.api_key YOUR_API_KEY
```

## Quick Start — Repurpose Everything

```bash
python3 scripts/repurpose.py VIDEO_URL --wait
```

This generates ALL formats at once: shorts, carousels, threads, quote cards, and audiograms.

## Commands

### Repurpose (All-in-One)
```bash
python3 scripts/repurpose.py VIDEO_URL [OPTIONS] --wait
```

**Options:**
- `--formats shorts,carousels,threads,quote_cards,audiograms` — Choose specific formats (default: all)
- `--shorts-count N` — Number of shorts (1-10, default: 5)
- `--shorts-style STYLE` — Caption style (default: hormozi)
- `--carousel-slides N` — Slides per carousel (default: 7)
- `--carousel-style STYLE` — corporate, minimal, bold, dark (default: corporate)
- `--thread-platform PLATFORM` — twitter, linkedin, both (default: both)
- `--thread-tone TONE` — casual, professional, provocative (default: casual)
- `--quote-cards-count N` — Number of quote cards (default: 3)
- `--quote-cards-style STYLE` — gradient, minimal, dark, bold (default: gradient)
- `--audiogram-count N` — Number of audiograms (default: 3)
- `--audiogram-style STYLE` — waveform, bars, circle (default: waveform)
- `--audiogram-format FORMAT` — square, vertical, both (default: both)
- `--language LANG` — Transcription language (default: auto-detect)
- `--wait` — Wait for completion (recommended)
- `--json` — JSON output

### Generate Shorts
```bash
python3 scripts/generate_shorts.py VIDEO_URL --count 3 --style hormozi --language pt --wait
```

**Styles:** `hormozi`, `mrbeast`, `ali_abdaal`, `iman_gadzhi`, `garyvee`

### Generate Carousels
```bash
python3 scripts/generate_carousels.py VIDEO_URL --slides 7 --style corporate --wait
```

**Styles:** `corporate`, `minimal`, `bold`, `dark`

### Generate Threads
```bash
python3 scripts/generate_threads.py VIDEO_URL --platform both --tone casual --wait
```

**Platforms:** `twitter`, `linkedin`, `both`
**Tones:** `casual`, `professional`, `provocative`

### Generate Quote Cards
```bash
python3 scripts/generate_quote_cards.py VIDEO_URL --count 3 --style gradient --wait
```

**Styles:** `gradient`, `minimal`, `dark`, `bold`

### Generate Audiograms
```bash
python3 scripts/generate_audiograms.py VIDEO_URL --count 3 --style bars --format both --wait
```

**Styles:** `waveform`, `bars`, `circle`
**Formats:** `square` (1080x1080), `vertical` (1080x1920), `both`

### Add Captions
```bash
python3 scripts/add_captions.py VIDEO_URL --style hormozi --language pt --wait
```

Adds viral captions to a full video (no clipping).

### Dashboard
```bash
python3 scripts/dashboard.py [--port PORT]
```
Opens a local web dashboard (default port 8765) showing jobs, shorts gallery, and credit usage.

### Check Credits
```bash
python3 scripts/check_credits.py
```

## Pricing (Credits)

| Format | Cost |
|--------|------|
| Shorts | 1 credit/minute |
| Carousels | 2 credits |
| Threads | 1 credit |
| Quote Cards | 1 credit |
| Audiograms | 2 credits |
| Repurpose (all) | 8 credits |

- 3 free credits on signup
- $29 for 200 credits (never expire)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/add-captions` | Add captions to video |
| POST | `/api/v1/generate-shorts` | Generate viral shorts |
| POST | `/api/v1/generate-carousels` | Generate carousel slides |
| POST | `/api/v1/generate-threads` | Generate Twitter/LinkedIn threads |
| POST | `/api/v1/generate-quote-cards` | Generate visual quote cards |
| POST | `/api/v1/generate-audiograms` | Generate audiogram clips |
| POST | `/api/v1/repurpose` | All formats in one call |
| GET | `/api/v1/job/{job_id}` | Check job status |
| GET | `/api/v1/credits` | Check credit balance |

## Links

- **API**: https://api.viral-claw.com
- **Docs**: https://viral-claw.com
- **Swagger**: https://api.viral-claw.com/docs
