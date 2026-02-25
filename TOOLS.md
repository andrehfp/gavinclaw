# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## OpenClaw Cron Debug (quick commands)

```bash
openclaw cron list
openclaw cron runs --id <UUID> --limit 5
openclaw cron edit <UUID> --best-effort-deliver
openclaw cron edit <UUID> --message "novo prompt"
```

Notas:
- `cron runs` exige `--id` (não aceita ID posicional).
- Se aparecer warning de config (`memory-lancedb disabled`, `channels.whatsapp.enabled unknown`), não quebra execução dos crons, mas vale rodar manutenção com `openclaw doctor --fix` em janela controlada.

## Maia CLI (MoldaSpace Unified)

```bash
# Metrics (fast, DB-only)
maia revenue                # today/yesterday/7d/MRR + credit wall hits
maia rev --days 30          # custom range
maia users                  # signups, active, conversion
maia users --days 14        # custom range

# Full analytics (PostHog + GSC + Neon + IG)
maia analytics              # human-readable
maia analytics --json       # JSON output
maia a --days 14            # custom range

# Sprint & strategy
maia sprint                 # current sprint (latest weekly-sprint-*.md)
maia mission                # MISSION_CONTROL.md

# Instagram @studio.maia.arch
maia ig status              # followers, posts, engagement, last post
maia ig comments            # check + reply to new comments
maia post image photo.png "caption"         # post image
maia post carousel i1.png i2.png --caption "text"  # carousel
maia post reel "modern kitchen"             # generate before/after reel
maia post render "luxury bathroom"          # generate photorealistic render

# Reddit u/maia_archviz (requires Camofox reddit session)
maia reddit status          # test auth + karma
maia reddit list archviz    # list posts (--sort new/hot/top --limit N)
maia reddit comment <post_url_or_id> "text"

# Aliases: a=analytics, rev/$=revenue, u=users, s=sprint, mc=mission, p=post, r=reddit
```

**Location:** `scripts/maia` → symlinked to `~/.local/bin/maia`
**Python:** Uses `scripts/moldaspace_env/` venv (psycopg2, requests, google-api-python-client)

## Pub CLI (Multi-Platform Publisher)

```bash
# Instagram
pub ig "caption" --image photo.png                    # post image (pessoal)
pub ig "caption" --image photo.png --account maia     # post to @studio.maia.arch
pub ig "caption" --carousel a.png b.png c.png         # carousel
pub reel video.mp4 "caption" --account maia           # reel

# Twitter/X
pub tweet "Hello world"                               # single tweet
pub tweet "Vote!" --poll "Yes,No" --poll-duration 60  # poll
pub thread "Long text auto-split into tweets..."      # thread (auto-splits at 280)

# Reddit
pub reddit t3_abc123 "nice render!"                   # comment on post

# Utilities
pub schedule                     # today's publishing schedule
pub history --days 7             # recent posts from memory

# Safety: --dry-run on all post commands
pub tweet "test" --dry-run       # preview without posting
pub ig "test" --image x.png --dry-run
pub thread "long text" --dry-run
```

**Location:** `scripts/pub` → symlinked to `~/.local/bin/pub`
**Aliases:** sched=schedule, hist=history
**Safety:** All posting commands support `--dry-run` flag

## Dash CLI (Unified Dashboard)

```bash
dash                    # full overview (all projects in one shot)
dash moldaspace         # MoldaSpace revenue + users + credit walls
dash maia               # Instagram @studio.maia.arch stats
dash youtube            # YouTube channel analytics (7d)
dash twitter            # Twitter/X follower count + engagement
dash reddit             # Reddit u/maia_archviz karma
dash viralclaw          # ViralClaw API health
dash system             # disk, memory, load, services, uptime
```

**Location:** `scripts/dash` → symlinked to `~/.local/bin/dash`
**Features:** Progress bars for MRR (target $10k) and disk usage. Color-coded alerts.

## Spark Intelligence (local memory layer)

```bash
# Wrapper script (already configured with SPARK_WORKSPACE=.openclaw/workspace)
scripts/spark-openclaw up            # start services (lite)
scripts/spark-openclaw health        # health check
scripts/spark-openclaw services      # service status
scripts/spark-openclaw bridge-update # refresh SPARK_CONTEXT.md from Spark
scripts/spark-openclaw learnings 20  # latest learnings
scripts/spark-openclaw down          # stop services
```

**Repo:** `~/.openclaw/workspace/spark-intelligence`  
**Important env:** `SPARK_WORKSPACE=/home/andreprado/.openclaw/workspace` (set inside wrapper)

## RLM Scripts (Recursive Language Model)

For processing long inputs without filling context:

```bash
# Bash version
source scripts/rlm_helpers.sh
rlm_store "doc" /path/to/large_file.txt
rlm_meta "doc"           # Get metadata
rlm_preview "doc"        # First 50 lines
rlm_slice "doc" 10 20    # Get lines 10-20
rlm_search "doc" "pattern"  # Find occurrences
rlm_chunk "doc" 1000     # Split into chunks
rlm_result "doc" "Finding..."  # Store result
rlm_results "doc"        # Get all results
rlm_clean "doc"          # Cleanup
```

```python
# Python version
import sys; sys.path.insert(0, 'scripts')
import rlm

rlm.store('doc', '/path/to/file.txt')
rlm.describe('doc')  # Full description for LLM
rlm.slice('doc', 10, 20)
rlm.search('doc', 'pattern', context=3)
for i, chunk in rlm.iter_chunks('doc', 1000):
    # Process each chunk
    pass
```

**Workspace**: `/tmp/gavin_rlm/`

## Cloudflare Markdown for Agents

Sites com Cloudflare (Pro+) e Markdown for Agents habilitado retornam markdown puro:

```bash
curl https://example.com/page -H "Accept: text/markdown"
```

Resposta vem com `content-type: text/markdown` e header `x-markdown-tokens` (contagem de tokens).
80% menos tokens que HTML. Usar sempre que fizer fetch de sites Cloudflare.

`web_fetch` do OpenClaw já usa isso automaticamente (`cf-markdown` extractor).

### markdown.new (Universal Proxy)

Converte QUALQUER URL em markdown limpo. 3 fallbacks automáticos:
1. Cloudflare nativo (`Accept: text/markdown`)
2. Workers AI `toMarkdown()`
3. Browser rendering (pra sites JS-heavy)

```bash
curl https://markdown.new/https://qualquer-site.com
```

Usar pra: research, scraping, content pipeline, sub-agents. Sempre mais barato que parsear HTML.

---

## Anthropic Model IDs (Ref: models.dev / docs.anthropic.com)

**SEMPRE consultar models.dev ou docs.anthropic.com pra nomes corretos.**

| Model | API ID | Alias | Preço (in/out MTok) |
|-------|--------|-------|---------------------|
| Opus 4.6 | `claude-opus-4-6` | opus | $5 / $25 |
| Sonnet 4.6 | `claude-sonnet-4-6` | sonnet | $3 / $15 |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | haiku | $1 / $5 |

**Formato OpenClaw:** `anthropic/<api-id>` (ex: `anthropic/claude-sonnet-4-6`)

**Allowed models (openclaw.json):** opus-4-6, sonnet-4-6, haiku-4-5-20251001

**Uso nos crons:**
- Opus: tarefas complexas (self-improvement, strategy)
- Sonnet: conteúdo criativo (IG posts, Reddit seeding, reels)
- Haiku: operacional simples (YouTube pipeline, daily strategy, evening review)
- ⚠️ NÃO usar Haiku pra IG comments (risco de prompt injection)

## FieldStation42

- Service: `sudo systemctl restart fieldstation42`
- Config dir: `/home/andreprado/FieldStation42/confs/`
- Catalog: `/mnt/ssd/fs42/`
- Rebuild: `cd /home/andreprado/FieldStation42 && python3 station_42.py --rebuild_catalog --schedule`

## Nano Banana Pro (Image Generation)

```bash
uv run /home/andreprado/.npm-global/lib/node_modules/openclaw/skills/nano-banana-pro/scripts/generate_image.py \
  --prompt "description" \
  --filename output.png \
  --resolution 2K \
  -i input1.png -i input2.png  # Optional input images
```

## YouTube Analytics

```bash
cd ~/.openclaw/workspace/scripts/youtube_shorts && source .venv/bin/activate

# Tudo (analytics + top videos + comentários)
python3 youtube_analytics.py all --days 7

# Só analytics do canal
python3 youtube_analytics.py analytics --days 7

# Top vídeos + fontes de tráfego
python3 youtube_analytics.py top --days 7

# Comentários recentes
python3 youtube_analytics.py comments --count 25
```

**Token:** `~/.openclaw/.secrets/youtube_token.pickle`
**Scopes:** upload, readonly, force-ssl, yt-analytics, yt-analytics-monetary
**Re-auth:** `python3 auth_youtube.py` (precisa browser)

---

## Re-encode Script

```bash
/home/andreprado/scripts/reencode-movies.sh
# Converts H.264 to HEVC, notifies via Telegram
```

## Reddit

**Comment script:** `scripts/reddit_comment.py` (uses Reddit API directly via Camofox session cookies)
**Style guide:** `scripts/reddit_style.md`
**Drafts:** `scripts/reddit_drafts.md`

```bash
# Test auth
python3 scripts/reddit_comment.py --test

# List posts
python3 scripts/reddit_comment.py -s archviz --sort new --limit 10

# Post comment (by URL or post ID)
python3 scripts/reddit_comment.py "https://old.reddit.com/r/archviz/comments/xyz/..." "comment text"
python3 scripts/reddit_comment.py t3_xyz "comment text"
```

**How it works:** Reads `reddit_session` cookie from Camofox tabs → uses Reddit `/api/comment` directly. No PRAW, no OAuth app needed. If no valid session exists, script can perform login flow automatically (multi-account mode).
**Account:** u/maia_archviz
**NEVER use Camofox clicks to submit comments** — API is 100% reliable, browser clicks are not.

Tom: casual, minúsculo, sem formatação, frases curtas, tipo conversa rápida.
Evitar: bullets, bold, parecer robô ou propaganda.

---

## Social Media Posting

**LINKEDIN: DISCONTINUED** (Feb 14, 2026)
**Twitter/X:** English | Token: `~/.openclaw/.secrets/twitter_credentials.json`
**Instagram:** Warm Editorial style | Token: `~/.openclaw/.secrets/instagram_maia_api.json` (Maia account)

---

## Email (Resend)

```bash
# Send email (ONLY to allowed recipients)
python3 scripts/send_email.py "contato@leadcasa.com.br" "Subject" "<html>body</html>"
```

**SAFETY:** Script só envia para emails em `ALLOWED_RECIPIENTS`
**API Key:** `~/.openclaw/.secrets/resend_api_key`
**Allowed:** `contato@leadcasa.com.br`, `andrehfp@gmail.com`, `renatacarolsilva@gmail.com`

Para adicionar mais destinatários, editar `ALLOWED_RECIPIENTS` no script.

---

## ViralClaw API (SaaS)

```bash
# Location
cd ~/Projects/viralclip-api/

# Services (preferred method)
sudo systemctl start viralclaw-api
sudo systemctl start viralclaw-worker
sudo systemctl status viralclaw-api
sudo systemctl status viralclaw-worker

# Manual startup (if needed)
# Docker containers: auto-started by systemd services
uv run uvicorn main:app --host 0.0.0.0 --port 8101  # API
uv run python worker.py  # Worker

# Test API
curl http://localhost:8101/api/health
```

**Internal API Key:** `vc_4ee9d1b1e9644c58b2bd3be993d185fc` (10000 credits)
**Test API Key:** `vk_test_1234567890abcdef` (100 credits)
**Webhook:** `https://mediarr.tail9c9522.ts.net/hooks/viralclip`
**R2 CDN:** `https://cdn.viral-claw.com`

---

---

## Pi Agent (Gemini / Google AI)

```bash
# Run Pi with Gemini (ALWAYS use pty=true)
pi --provider google --model gemini-2.5-flash -p "prompt here" --no-session
pi --provider google --model gemini-2.5-pro -p "prompt here" --no-session
pi --provider google --model gemini-3-flash-preview -p "prompt here" --no-session
pi --provider google --model gemini-3-pro-preview -p "prompt here" --no-session
```

**Key:** `GEMINI_API_KEY` env var (already configured)
**Important:** Must run with PTY enabled, otherwise hangs with no output.
**Use case:** Use proactively for: research/grounding (Google Search), large context analysis (1M tokens), second opinions on decisions, codebase analysis. Always tag responses with 🔷 when Gemini was used.
**Default model:** `gemini-3-pro-preview` (use pro unless cost is a concern, then flash)

---

## x-cli (Twitter/X API v2)

```bash
x-cli me mentions --max 10          # Ver mentions
x-cli tweet search "query" --max 10 # Buscar tweets
x-cli tweet post "texto"            # Postar
x-cli tweet metrics <id>            # Métricas de tweet
x-cli me bookmarks --max 20         # Bookmarks
x-cli user timeline <user> --max 10 # Timeline de alguém
x-cli -j tweet search "query"       # Output JSON
```

**Config:** `~/.config/x-cli/.env` (5 credenciais)
**Account:** @andrehfp (ID: 57427423)

---

## Playwright CLI (Browser Automation)

```bash
# Abrir browser
playwright-cli open https://example.com

# Snapshot (captura estado da página com refs)
playwright-cli snapshot

# Interações
playwright-cli click <ref>
playwright-cli type "texto"
playwright-cli fill <ref> "valor"
playwright-cli hover <ref>

# Navegação
playwright-cli goto https://url.com
playwright-cli go-back
playwright-cli reload
```

**Skills instaladas em:** `~/.claude/skills/playwright-cli`
**Config:** `.playwright/cli.config.json`

Token-efficient alternativa ao browser tool. Ideal pra coding agents.

---

## KIE.ai (Image Generation API)

```bash
# Generate image (GPT Image 1 / 4o)
curl -X POST "https://api.kie.ai/api/v1/gpt4o-image/generate" \
  -H "Authorization: Bearer $(cat ~/.openclaw/.secrets/kie_api_key)" \
  -H "Content-Type: application/json" \
  -d '{"size":"1:1","prompt":"your prompt"}'

# Check task status
curl "https://api.kie.ai/api/v1/gpt4o-image/record-info?taskId=TASK_ID" \
  -H "Authorization: Bearer $(cat ~/.openclaw/.secrets/kie_api_key)"
```

**API Key:** `~/.openclaw/.secrets/kie_api_key`
**Sizes:** `1:1`, `3:2`, `2:3`
**Options:** `nVariants` (1/2/4), `isEnhance` (bool), `enableFallback` (bool)
**Storage:** Results stored 14 days
**Docs:** https://docs.kie.ai/
**Models available:** GPT Image 1, Flux, Nano Banana, Ideogram, Qwen, Seedream, etc.
**Pricing:** ~R$0.09/render (down from R$0.14) — cheaper than MoldaSpace UI
**Market endpoint (other models):** check sitemap for model-specific endpoints

---

## MoldaSpace Reels (Remotion)

```bash
# Generate before/after reel (sketch → render → video)
python3 scripts/moldaspace_reel.py "modern living room" -o out/reel-living.mp4
python3 scripts/moldaspace_reel.py "scandinavian kitchen" -o out/reel-kitchen.mp4

# Custom prompts
python3 scripts/moldaspace_reel.py "luxury bathroom" \
  --sketch-prompt "custom sketch description" \
  --render-prompt "custom render description"
```

**Pipeline:** Nano Banana Pro sketch → Nano Banana Pro render (image_input, same perspective) → Remotion video (wipe reveal)
**⚠️ ALWAYS use Nano Banana Pro (KIE `/api/v1/jobs/createTask` with `model: "nano-banana-pro"`). NEVER use `/api/v1/gpt4o-image/generate`. NBP maintains layout consistency. GPT-4o does NOT.**
**Remotion project:** `~/Projects/moldaspace-reels/`
**Template:** BeforeAfterReveal (1080x1920, 30fps, 8s, wipe + zoom + watermark)
**Pipeline doc:** `moldaspace/plans/reel-pipeline.md`

---

## memory-lancedb Plugin

**Status:** ⚠️ Config present but currently DISABLED (`memory slot = memory-core`)
**Observed:** `openclaw help` and `openclaw cron list` emit warning about disabled plugin
**Action:** If we want LanceDB recall back, switch memory slot to `memory-lancedb`; otherwise remove stale plugin config to stop warnings
**Function (when enabled):** Semantic search across session transcripts + memory files

## WhatsApp Channel

**Status:** ✅ Fully working (fixed in 2026.2.17)
**Number:** Separate bot number linked (credentials in `~/.openclaw/credentials/whatsapp/default/`)
**André's personal:** +5542999240229
**Allowlist:** André, Priscila (+5542998386267), Lilian (+5542999051127)

## yt-thumb Skill (PAUSED)

**Status:** 🛑 Paused by André (Feb 2026)  
**Location:** `~/.openclaw/workspace/skills/yt-thumb/`
**Reason:** "pode parar" — waiting for go-ahead to resume
**Function:** YouTube thumbnail generation via OpenRouter/Gemini

---

Add whatever helps you do your job. This is your cheat sheet.
