# MEMORY.md - Long-term Memory

## Quick Reference
- **Human:** André Prado (Telegram: 5911430092)
- **Location:** Ponta Grossa, PR | TZ: America/Sao_Paulo
- **Server:** mediarr (Ubuntu 24.04)

## Key Services
- **FieldStation42:** TV simulator @ `/home/andreprado/FieldStation42/`
  - Rebuild: `python3 station_42.py --rebuild_catalog --add_week`
  - Service: `sudo systemctl restart fieldstation42`
- **ViralClaw API:** SaaS @ `~/Projects/viralclip-api/` — **Gavin has full strategic ownership** (only consult André on costs)
  - Stack: FastAPI + PostgreSQL + Redis + Workers
  - Docker: viralclip-redis (6379), viralclip-postgres (5432)
  - API: port 8101
- **Disk:** /mnt/ssd (1.8TB) - monitor at 85%+

## Disk Warning
- /mnt/ssd at 86% (259G free) — approaching threshold, monitor closely

## ViralClaw Skill Repo
- https://github.com/viralclaw/openclaw-skill (main branch)
- Local dashboard included (scripts/dashboard.py, port 8765)

## ViralClaw VPS Deploy
- Deploy user HAS sudo access for service management
- Script: `~/Projects/viralclaw-api/deploy/deploy-api-only.sh`
- VPS worker can be restarted: `sudo systemctl restart viralclaw-worker@1`
- YouTube downloads blocked on VPS — use local download + file upload via API

## Hostinger Partnership
- Guide: `memory/hostinger-guide.md`
- Link: https://hostinger.com/andreprado | Coupon: ANDREPRADO

## Preferences
- Portuguese: use "você" not "tu"
- 24h time format
- Use Haiku for background tasks (cost savings)
- Clean, aligned UI matters

## Potential Projects
- **AI Personalized Children's Books** - Generate custom kids books with AI (RESEARCHING)
  - Concept: theme + references → AI story + illustrations → print & ship
  - Target: 10-15 pages, pricing R$79-149
  - Competitor: Dentro da História (R$99-169, templates only)
  - Print options:
    - Gelato/Lulu APIs (~$8-15 USD, 20pg softcover) — needs pricing scrape
    - Home printing: Epson EcoTank on Couché 150g+ (~R$10-15/book)
  - **Blocker**: Couldn't scrape Gelato/Lulu pricing (Cloudflare 403, DNS errors)
  - André confirmed interest in pricing research

## Modal Integration (ViralClaw)
- **Status**: WORKING ✅ (job 37: 5 shorts from 37min video in ~12min)
- **Architecture**: VPS API → VPS Worker → Modal `process_shorts.remote()` → R2
- **Modal app**: `viralclaw-worker` with `process_shorts` + `process_shorts_web` functions
- **Key fix**: `mediapipe==0.10.21` (v0.10.32 removed `mp.solutions`)
- **Key fix**: `_ensure_h264()` in `split_video.py` — auto-transcodes AV1→H.264 before opencv
- **Key fix**: ffmpeg timeout 300s → 900s for long videos
- **VPS config**: `USE_MODAL_WORKER=true`, Modal token in `/opt/viralclaw/.env`
- **VPS has sudo**: deploy user can restart services, edit .env, run psql
- **DB issue**: Modal shorts not saved to `shorts` table (worker logs count but 0 rows)
- **VPS DB password**: `a719a574d2bc556b49733752220d2440`
- **Local services DISABLED**: André requested — only VPS + Modal

## Active Projects
- **Bboox** - AI Personalized Children's Books — **Gavin has full strategic/marketing ownership**
  - Repo: github.com/andrehfp/bboox | Telegram topic: 1386 (group -1003702782668)
  - Stack: Next.js + Convex + WorkOS + fal.ai + OpenRouter
  - Domain: bboox.io (to register on Cloudflare)
  - Pricing: R$49.90 digital BR, $9.90 USD, $29.90/$39.90 print (INT only)
  - Paywall: after full preview, before PDF download
  - Goal: $10k/month in 6 months
  - Deliverables in bboox/: GROWTH_PLAN.md, SPECS.md, LANDING_COPY.md, PRODUCT_HUNT_PLAN.md, INFLUENCERS.md, EMAIL_TEMPLATES.md
  - Issues: #1 preview links, #2 checkout, #3 upsells, #4 image resolution, #5 SEO, #6 termos/privacidade
  - André handles code, Gavin handles strategy/marketing/issues
  - Landing page quase pronta, checkout sendo implementado (2026-02-11)

- **ViralClaw SaaS** - Full content repurposing platform for AI agents
  - "One Video. Every Format." — 6 output formats
  - Formats: shorts, carousels, threads, quote cards, audiograms, repurpose (all-in-one)
  - Credit-based pricing: $29/200 credits, 3 free on signup
  - **Production live**: api.viral-claw.com / viral-claw.com
  - Stack: FastAPI + PostgreSQL + Redis + Caddy + R2 (signed URLs)
  - Features: TUS upload, LLM copy (Groq/LLaMA 70B), multi-mode moment detection, OpenRouter support
  - VPS: Hostinger 76.13.231.67:2222 (deploy user, NO sudo)
  - Deploy: rsync from local → VPS, André must restart services
  - Sentry alerts → Telegram thread (group -1003702782668, thread 446)
  - Cost structure: `memory/viralclaw-cost-structure.md`
  - Scale plan: VPS → Modal serverless → Hetzner GPU
  - **Local Development**: DISABLED (André requested). Only VPS + Modal.
  - **Local mediapipe**: pinned to 0.10.21 (0.10.32 broke mp.solutions)
  - **YouTube Pipeline**: Automated shorts creation every 2h via cron, using internal API key

- **YouTube Shorts Automation** - Full pipeline using ViralClaw
  - Monitor channel → ViralClaw job → download → upload to YouTube
  - Cron: every 2h check, auto-upload at 9h and 21h
  - Fixed split_video.py for screencast_webcam layout
  - Telegram topic: channelId -1003702782668, threadId 19

- **yt-thumb Skill** - YouTube thumbnail generation (PAUSED)
  - Location: `~/.openclaw/workspace/skills/yt-thumb/`
  - OpenRouter integration for Gemini 3 Pro
  - Spec: 1280x720, 2 variations
  - Status: André said "pode parar" — waiting for go-ahead

## Skills Available
Use `memory_search` for specific recall. Don't load everything.

---
*Keep this lean. Archive details to memory/*.md files.*
