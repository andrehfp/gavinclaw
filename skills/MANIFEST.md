# SKILLS MANIFEST
> Gavin's Standard Operating Procedure. Updated: 2026-02-15.

## Execution Rules

1. **Shell first**: Before answering, check if a script, command, or dependency solves it better than prose.
2. **Skills encode repeatable work**: If you do something twice, it becomes a skill in `/skills/`.
3. **Artifacts go to `output/`**: All final outputs (reports, images, code, designs) saved to `~/.openclaw/workspace/output/`. That's the handoff boundary.
4. **Memory survives compaction**: Key state goes to `memory/*.md` and `MEMORY.md`. Never lose context silently.
5. **Fail forward**: Document failures in this manifest so the same mistake never happens twice.

---

## Active Skills

| Skill | Status | Use When | Don't Use When |
|---|---|---|---|
| **content-brainstorm** | ✅ Active | Brainstorming post ideas, repurposing across platforms, writing hooks/threads/carousels | Deep video repurposing pipeline (use hormozi-content-engine) |
| **excalidraw-diagram** | ✅ Active | Architecture visualization, system diagrams, component maps from codebases | Flowcharts of business logic, UML class diagrams, simple text docs |
| **hormozi-content-engine** | ✅ Active | YouTube video → multi-platform content (Twitter + IG + Shorts). Has reference files for CTAs, platform rules, content atoms | Writing from scratch without source video. Single post (use content-brainstorm) |
| **hormozi-rich-pricing** | ✅ Active | Definir precificação premium e tier ladder “sell to rich”, com ICP upmarket, oferta high-ticket e testes de close-rate | Estratégia de conteúdo por vídeo (use hormozi-content-engine) |
| **recursive-processor** | ✅ Active | Input >50k tokens, large files, hierarchical summarization, divide-and-conquer | Input fits in context (<50k), simple summaries, real-time tasks |
| **tree-of-thoughts** | ✅ Active | Hard decisions with trade-offs, debugging with multiple causes, comparing 3+ approaches | Straightforward answers, quick opinions, routine questions |
| **viralclaw** | ✅ Active | Creating shorts from video, submitting ViralClaw jobs, checking job status | Text content, image generation, generic video editing |
| **youtube-thumbs** | ⏸️ Paused | YouTube thumbnail generation. André said "pode parar" | Currently paused — wait for go-ahead |
| **social-media-poster** | ✅ Active | Cross-platform posting (Twitter, Instagram). Has scripts for each platform | Never post without André's approval in Telegram topic 1691 |

## Deprecated Skills

| Skill | Status | Reason |
|---|---|---|
| **linkedin-os** | ❌ Discontinued (2026-02-14) | André decided to stop LinkedIn. Focus on Twitter/X + Instagram |

## Built-in Skills (OpenClaw native)

| Skill | Location | Notes |
|---|---|---|
| **coding-agent** | openclaw/skills/ | Run Codex CLI, Claude Code via background process |
| **github** | openclaw/skills/ | `gh` CLI for issues, PRs, CI runs |
| **healthcheck** | openclaw/skills/ | Security hardening, firewall, SSH, exposure review |
| **nano-banana-pro** | openclaw/skills/ | Image generation via Gemini 3 Pro |
| **skill-creator** | openclaw/skills/ | Create/update skills with proper structure |
| **tmux** | openclaw/skills/ | Remote-control tmux sessions |
| **video-frames** | openclaw/skills/ | Extract frames/clips from videos with ffmpeg |
| **weather** | openclaw/skills/ | Weather forecasts, no API key needed |

---

## Failure Log (Negative Examples)

### ❌ Instagram carousel publish — first attempt often fails
**When**: Publishing carousels via Graph API
**What happened**: Container status returns FINISHED but publish call fails with error
**Fix**: Always retry publish after 10-15s delay. Built into workflow now.
**Skill affected**: social-media-poster

### ✅ Reddit seeding via Camofox — login resolved
**When**: Automated Reddit login via Camofox browser
**What happened**: Cloudflare/bot detection blocks login page. Can't authenticate.
**Fix**: André manually logged in + exported cookies. Created `scripts/reddit_comment.py` using Reddit API directly with Camofox session cookies. No PRAW/OAuth needed.
**Status**: RESOLVED (2026-02-15)
**Skill affected**: MoldaSpace Reddit seeding (cron job)

### ❌ KIE.ai URLs expire before download
**When**: Generating MoldaSpace reels (sketch → render → video)
**What happened**: KIE.ai signed URLs expire (~30min) before the pipeline downloads them, causing 403 Forbidden
**Fix**: Need to download immediately after generation completes, not batch later.
**Skill affected**: moldaspace_reel.py

### ❌ ViralClaw shorts not saved to DB
**When**: Modal worker processes shorts successfully
**What happened**: Worker logs show correct count but 0 rows in `shorts` table
**Fix**: DB write issue in worker. Investigated but not fully resolved.
**Skill affected**: viralclaw

### ❌ Heartbeat response leaked to Telegram
**When**: 2026-02-15, heartbeat check output sent to André's chat
**What happened**: Internal heartbeat status ("2. FieldStation42:") appeared as a message to André
**Fix**: Heartbeat responses should be HEARTBEAT_OK only. Never narrate checks in the reply.
**Skill affected**: heartbeat system

### ❌ Pi Agent hangs without PTY
**When**: Running `pi` command without `pty: true`
**What happened**: Process hangs indefinitely with no output
**Fix**: ALWAYS use `pty: true` when invoking Pi Agent / Gemini
**Skill affected**: gemini integration

### ✅ Twitter/X posting — permissions resolved
**When**: Trying to post tweets via API
**What happened**: API returns permission error — app only has Read access
**Fix**: André updated permissions at developer.x.com and regenerated tokens
**Status**: RESOLVED (2026-02-15)
**Skill affected**: social-media-poster (Twitter)

### ❌ Codex sub-agent killed by signal 9
**When**: Long-running Codex tasks
**What happened**: Process killed after timeout (15-30min)
**Fix**: Respawn immediately with same task. Document in active-tasks.md.
**Skill affected**: coding-agent

---

## Pending Skills (to create when needed)

- **email-sender**: Resend API wrapper (currently just a script)
- **youtube-analytics**: Channel analytics + top videos (currently scripts)
- **moldaspace-growth**: Reddit seeding + metrics + content pipeline
- **tinysaas-newsletter**: Beehiiv newsletter drafting + publishing

---

## Artifact Locations

| Type | Path |
|---|---|
| Final outputs | `output/` |
| Content batches | `output/content-batch/` |
| MoldaSpace renders | `moldaspace/renders/` |
| Memory/state | `memory/` |
| Scripts | `scripts/` |
| Skills | `skills/` |

---

*This manifest is the single source of truth for what I can do, what broke, and where things live. Update it when skills change.*
