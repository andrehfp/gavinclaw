# ViralClaw – OpenClaw Skill

Transform any video into a viral short with AI-powered captions. One API call, five styles.

## Install

```bash
openclaw skill install viralclaw
```

## Setup

```bash
openclaw config set viralclaw.api_key YOUR_API_KEY
```

Get your free API key (3 free minutes) at [viral-claw.com](https://viral-claw.com).

## Usage

```bash
# Generate viral shorts from a YouTube video
python3 scripts/generate_shorts.py "https://youtube.com/watch?v=..." --style hormozi --wait

# Add captions to a full video
python3 scripts/add_captions.py "https://youtube.com/watch?v=..." --style mrbeast --wait

# Detect best moments only
python3 scripts/detect_moments.py "https://youtube.com/watch?v=..." --count 5

# Check your credits
python3 scripts/check_credits.py
```

## Caption Styles

| Style | Description |
|-------|-------------|
| `hormozi` | Bold white, yellow highlights, dark background |
| `mrbeast` | Colorful, large text, dynamic animations |
| `ali_abdaal` | Clean, minimal, professional |
| `iman_gadzhi` | Luxury aesthetic, gold accents |
| `garyvee` | Raw, energetic, street-style |

## Pricing

- **3 free minutes** on signup (no credit card)
- **$29 for 200 credits** (1 credit = 1 minute, never expire)

## Links

- **Website**: https://viral-claw.com
- **API**: https://api.viral-claw.com
- **API Docs**: https://viral-claw.com/llms.txt

## License

MIT


## Gavin replication

This repo is also the replication source of the Gavin runtime profile.

- Manifest: `replication/MANIFEST.md`
- Bootstrap guide: `replication/BOOTSTRAP_NEW_MACHINE.md`
- Sync from active workspace: `scripts/sync_from_workspace.sh`
- Restore into workspace: `scripts/restore_to_workspace.sh`
