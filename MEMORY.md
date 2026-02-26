# MEMORY.md - Long-term Memory

## Quick Reference
- **Human:** André Prado (Telegram: 5911430092)
- **Location:** Ponta Grossa, PR | TZ: America/Sao_Paulo
- **YouTube:** @AndrePrado
- **Histórico:** cofundou a **AIBuilders** com Felipe Raitano e vendeu sua participação por **R$200 mil**.
- **Server:** mediarr (Ubuntu 24.04)
- **Reference link (memory):** https://spark.vibeship.co/

## Key Decisions
- **MoldaSpace is #1 priority.**
- **Bboox saiu do foco ativo** por decisão do André (2026-02-24).
- **ViralClaw em banho-maria** até novo sinal (2026-02-24).

## Current Blockers
- Nenhum blocker crítico ativo registrado no momento.

## Pausado por decisão do André
- **MicroSaaS courses** - transcrição adiada ("esquece por agora", 2026-02-23)
- **ViralClaw** - banho-maria até novo sinal (2026-02-24)

## Cancelled/Dropped
- ~~OpenNode account~~ - removed from blockers (not related to MoldaSpace)
- ~~Cloudflare Email Routing~~ - cancelled by André (2026-02-16)
- ~~Notion integration~~ - cancelled by André (2026-02-16)

## WhatsApp
- **Connected**: separate number linked, credentials at `~/.openclaw/credentials/whatsapp/default/`
- **André's personal**: +5542999240229
- **Cross-context messaging**: enabled (`allowAcrossProviders: true`)
- **Status**: ✅ Inbound working + outbound works in reply (within 24h window). Proactive outbound blocked by WhatsApp policy (Baileys limitation — use Telegram for proactive).

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
- /mnt/ssd at 85% (269G free) — approaching threshold, monitor closely

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

## Roadmap (Gavin)
- **Rede de AI Influencers** — Após @studio.maia.arch validar (500+ seguidores), criar 2-3 novas personas Instagram (ex: Kai/exterior, Luna/luxury) com nicho próprio, todos funil pro MoldaSpace. Pipeline já existe, é só duplicar. Aguardando sinal verde do André.

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

## André's Products (4 ativos)
1. **MoldaSpace** (moldaspace.com) — renders fotorrealistas com IA. MRR ~$395 (atualizado Feb 17, 2026)
2. **InfoMyGraphic** (infomygraphic.com) — cria infográficos com Nano Banana Pro. Usar como fonte de conteúdo pro Instagram!
3. **Questiono** — plataforma pra exame CFC de contabilidade
4. **ViralClaw** (viral-claw.com) — shorts de vídeos pra agentes de IA. Em testes.

## Reddit Seeding — Multi-Account
- **Script:** `scripts/reddit_comment.py` — suporta múltiplas contas via `--account`
- **Contas:**
  - `maia_archviz` (default) — MoldaSpace → r/archviz, r/Design
  - `listing_lab` — Real estate AI content → r/realtors, r/RealEstate, r/RealEstateAgents
- **Credenciais:** `scripts/reddit_accounts.json`
- **Login automático:** se não tiver tab Camofox aberta, script loga sozinho
- **Uso:** `python3 scripts/reddit_comment.py <url> "texto" --account listing_lab`

## Active Projects
- **CreatorOps Relay** - Nova base para versão vendável de Instagram Ops (private repo)
  - Repo: github.com/andrehfp/creatorops-relay (created 2026-02-22)
  - Stack: FastAPI + SQLite (command-first)
  - Diferenciais MVP: aprovação humana (approve/reject), idempotência por `external_key`, timeline de eventos por job, retries com backoff, allowlist de contas por env
  - Endpoints: `/commands/*`, `/jobs/{id}`, `/jobs/{id}/approve`, `/jobs/{id}/reject`, `/jobs/pending-approval`
  - Script de validação: `scripts/smoke_test.sh`

- **InstaRelay** - Backend MVP legado (private repo)
  - Repo: github.com/andrehfp/instarelay (created 2026-02-21)
  - Status: mantido como referência; não usar como base principal da oferta vendável atual

- **Bboox** - fora do foco ativo (decisão do André em 2026-02-24).

- **ViralClaw SaaS** - Full content repurposing platform for AI agents (**BANHO-MARIA por decisão do André em 2026-02-24**)
  - "One Video. Every Format." — 6 output formats
  - Formats: shorts, carousels, threads, quote cards, audiograms, repurpose (all-in-one)
  - Credit-based pricing: $29/200 credits, 3 free on signup
  - **Production live**: api.viral-claw.com / viral-claw.com
  - Stack: FastAPI + PostgreSQL + Redis + Caddy + R2 (signed URLs)
  - Features: TUS upload, LLM copy (Groq/LLaMA 70B), multi-mode moment detection, OpenRouter support
  - VPS: Hostinger 76.13.231.67:2222 (deploy user, with sudo)
  - Deploy: rsync from local → VPS, worker/API can be restarted via systemd
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

## Social Media Pipeline (established 2026-02-12)
- **LinkedIn:** REACTIVATED (2026-02-25) via local scripts (`scripts/linkedin_post.py`, `scripts/linkedin_reader.py`), write scope active (`w_member_social`), read/analytics scope still missing (`r_member_social`)
- **Twitter/X:** EN, brain dump style, `scripts/twitter_post.py` (threads auto for >280 chars)
- **Instagram:** Warm Editorial style, `scripts/instagram_post.py` (needs public URLs → imgur)
- **Image Gen:** KIE.ai Nano Banana Pro (`scripts/kie_generate.py`)
- **Infographics:** Use InfoMyGraphic (infomygraphic.com) as content source + product showcase
- **Telegram topic 1691** = Social Media content channel
- **Sub-nicho:** AI agents para indie hackers/solopreneurs
- **Calendar:** `memory/content-calendar.md` (unified)
- **Approval flow:** Always show text + image in Telegram before posting. Inline buttons ✅/✏️/❌
- **Daily 08h:** Cron sends publishing schedule for the day
- **"calendário"** command in topic 1691 → returns week overview

## Visual Style (ALL platforms)
- **Default style:** Warm Editorial (beige/cream #F5F0EB, dark brown serif, warm orange-brown accents, clean/minimal)
- **Instagram pessoal (@andrefprado):** Warm Editorial + watermark @andrefprado (canto inferior direito, marrom discreto)
- **Instagram Maia (@studio.maia.arch):** Warm Editorial + watermark @studio.maia.arch
- **TinySaaS colorful** — ONLY for tinysaas.com.br site, NOT for social posts (André achou "carnavalesco")
- Brand kit TinySaaS (site only): `output/newsletter/tinysaas-brand-kit.md`

## Instagram Posting
- Scripts: `scripts/instagram_post.py` + `scripts/instagram_reel.py`
- **Duas contas:**
  - `--account pessoal` → `instagram_credentials.json` → @andrefprado (André pessoal)
  - `--account maia` → `instagram_maia_api.json` → @studio.maia.arch (MoldaSpace)
- Default é `pessoal` se não passar flag
- Para reels: terceiro argumento positional (`pessoal` ou `maia`)
- ⚠️ SEMPRE especificar conta explicitamente nos crons!
- Needs public URLs (imgur works for upload)
- Carousel publish may need retry (container FINISHED but publish can fail first attempt)
- Calendar: `memory/instagram-calendar.md`
- **Topic 1691** = pessoal (@andrefprado) | **Topic 2265** = Maia (@studio.maia.arch)

## MoldaSpace Product Facts (NEVER get wrong)
- **Free credits on signup: 5** (not 50, not 10, not 50 — FIVE)
- Any copy, caption, or video that mentions credits must say "5 free renders" or "5 free credits"

## MoldaSpace (André's project)
- **URL:** moldaspace.com | **Repo:** github.com/andrehfp/moldaspace (READ ONLY)
- **Telegram topic:** 2265 (group -1003702782668)
- **Goal:** $10k/month | **MRR:** ~$395 (Feb 17) | 814 users, 33 buyers (4%)
- **Stack:** Next.js + Clerk + Stripe + Neon + R2 + KIE.ai/OpenRouter
- **Secrets:** `~/.openclaw/.secrets/moldaspace_*` (PostHog, GSC, DB)
- **DB:** Neon readonly access, PostHog project 257719
- **Workspace:** `moldaspace/` (memory + plans)
- **GitHub Issues:** #82-#86 (SEO, pricing, onboarding, conversion)
- **Gavin role:** Growth strategy + execution (content, SEO, metrics, community)
- **CLI:** `maia` — unified CLI (`maia rev`, `maia users`, `maia ig status`, `maia sprint`, etc.)
- **CLI:** `pub` — multi-platform publisher (`pub ig`, `pub tweet`, `pub thread`, `pub reddit`, `pub schedule`)
- **CLI:** `dash` — unified metrics dashboard (`dash`, `dash moldaspace`, `dash system`, etc.)

## André's Products
- **infomygraphic.com** — Creates infographics using Nano Banana Pro. Can be used for Instagram content (MoldaSpace, TinySaaS, etc.)

## Content Engine (Dashboard)
- SQLite backend: `content-engine.db`, module: `content_engine.py`
- API: `/api/content/posts`, `/scheduled`, `/queue`, `/stats` on port 8888
- Dashboard: `dashboard.html` (~1981 lines) — dark glassmorphism, sections: Overview, Content Engine, Tasks, System
- Known issue: `/api/status` hangs due to slow subprocesses — frontend has 5s timeout
- Migration ran from markdown calendars, had to dedupe
- **API format**: Stats returns `{stats: {platform_stats: [...]}}`, scheduled/queue wrap in own keys
- WIP: frontend→backend response format alignment (partially fixed 2026-02-15)

## Skills Available
Use `memory_search` for specific recall. Don't load everything.

---
*Keep this lean. Archive details to memory/*.md files.*
