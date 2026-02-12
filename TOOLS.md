# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

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

**Style guide:** `scripts/reddit_style.md`
**Drafts:** `scripts/reddit_drafts.md`

Tom: casual, minúsculo, sem formatação, frases curtas, tipo conversa rápida.
Evitar: bullets, bold, parecer robô ou propaganda.

---

## Social Media Posting

**LinkedIn:** Portuguese (PT-BR) | Token: `~/.openclaw/.secrets/linkedin_token.json`
**Twitter/X:** English | Token: `~/.openclaw/.secrets/twitter_credentials.json`
**Script:** `scripts/linkedin_post.py`
**LinkedIn Sub:** `eqDpblb7zU` (André Prado)
**LinkedIn App:** Gavin Claw (Client ID: 7744k3wtv3cldi)

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

Add whatever helps you do your job. This is your cheat sheet.
