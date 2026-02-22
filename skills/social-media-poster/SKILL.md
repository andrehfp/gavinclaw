# Social Media Poster Skill

## Overview
Unified cross-platform social media posting skill. Supports simultaneous or selective posting across platforms.

## Supported Platforms
- Twitter/X (EN)
- Instagram (Warm Editorial style)
- Facebook (optional)

LinkedIn is discontinued (Feb 14, 2026) and should not be used.

## Usage
```python
from social_media_poster import post

post(
    content="Your post text",
    platforms=["twitter", "instagram"],
    media=["/path/to/image.jpg"],
    hashtags=["#example", "#crossposting"],
    scheduling_options={
        "date": "2026-02-15T14:00:00",
        "timezone": "America/Sao_Paulo"
    }
)
```

## Configuration
Requires credentials in:
- `~/.openclaw/.secrets/twitter_credentials.json`
- `~/.openclaw/.secrets/instagram_maia_api.json`
- `~/.openclaw/.secrets/facebook_credentials.json` (optional)

## Platform-Specific Rules
- **Twitter/X:** English, concise, startup/tech focus
- **Instagram:** Visual-first, lifestyle/behind-the-scenes
- **Facebook:** Community-oriented content

## Roadmap
- [ ] Multi-platform scheduling
- [ ] Content adaptation per platform
- [ ] Analytics tracking
- [ ] A/B testing support