---
name: hormozi-content-engine
description: >
  Repurpose YouTube videos into multi-platform content using Alex Hormozi's content machine framework.
  Use when: user has a YouTube video/transcript to repurpose, wants to generate content from a video, needs to extract posts/tweets from long-form content, or wants to run the full content pipeline (YouTube → Twitter/X + Instagram + Shorts descriptions).
  Don't use when: writing a single post from scratch without source video (use content-brainstorm), brainstorming ideas without existing content (use content-brainstorm), or cutting video into shorts (use viralclaw).
  Outputs: platform-adapted posts (PT-BR for Instagram, EN for Twitter/X), short descriptions, CTAs, and content calendar from a single video source.
---

# Hormozi Content Engine

Transform one YouTube video into 20+ pieces of platform-native content.

Based on Alex Hormozi's framework: **Test → Record → Inject → Contextualize → Distribute**

## Core Principle

> "You are unquestionably an expert on your own life."

All content uses **"How I"** framing, never **"How To"**.
- ❌ "Como você deve criar conteúdo"
- ✅ "Como EU criei meu conteúdo"

## The Pipeline

```
YouTube video (source of truth)
  ↓ transcription
Extract key moments (insights, stories, frameworks, hot takes)
  ↓ contextualize per platform
Twitter/X (EN) + Instagram (PT-BR) + Short descriptions + Threads
  ↓ inject CTAs
Every piece gets a CTA. No exceptions.
  ↓ distribute
Volume: aim for 15-20 pieces per video
```

## Workflow

### Step 1: Receive Source Material
Accept one of:
- YouTube video URL → fetch transcript via API
- Raw transcript text
- ViralClaw job output (shorts + transcript)
- Key bullet points / ideas from a video

### Step 2: Extract Content Atoms
From the transcript, identify:

1. **Hot Takes** — contrarian opinions, bold claims (→ tweets, carousel hooks)
2. **Stories** — personal experiences with outcomes (→ captions, threads)
3. **Frameworks** — step-by-step processes, mental models (→ Instagram carousels, threads)
4. **Data Points** — specific numbers, results, evidence (→ tweets, post hooks)
5. **Quotable Lines** — one-liners that standalone (→ tweets, quote cards)

See [references/content-atoms.md](references/content-atoms.md) for extraction patterns.

### Step 3: Generate Platform-Native Content

For each atom, generate adapted versions per platform.
See [references/platform-rules.md](references/platform-rules.md) for format, tone, and structure per platform.

**Instagram (PT-BR)**
- Storytelling visual-first (caption + carousel/reel context)
- Caption structure: Hook → Contexto rápido → Insight prático → CTA
- "Você" (never "tu"), informal, claro e direto

**Twitter/X (EN)**
- Provocative, concise, standalone insight
- Max 280 chars for single tweets
- Threads for frameworks (tweet 1 = hook, then numbered steps)
- Brain dump style — stream of consciousness

**YouTube Shorts Descriptions**
- SEO-optimized title + description
- Relevant hashtags
- CTA to full video

### Step 4: Inject CTAs
See [references/cta-playbook.md](references/cta-playbook.md).

Every piece MUST have a CTA. Types:
- **Cross-platform**: "Full video on YouTube" / "Mais no Instagram"
- **Engagement**: "What's your take?" / "Comment below"
- **Lead capture**: Link to product, waitlist, lead magnet
- **Share**: "Repost if you agree"

Rotate CTAs — 2 versions per type to keep fresh.

### Step 5: Output

Format each piece as:

```
## [Platform] — [Content Type]
Source: [timestamp or atom reference]

[Ready-to-post content with CTA included]

---
Type: [hot take / story / framework / data / quote]
CTA: [type of CTA used]
```

## André's Content Pillars

Use these as filters when extracting content atoms:

1. **AI-First Solo Dev** — building entire products with AI, no team needed
2. **Speed > Perfection** — launching fast, killing fast, iterating
3. **Real Numbers** — revenue, costs, timelines, no vanity metrics
4. **Anti-Conventional** — challenging dev culture, hiring norms, tool worship
5. **Indie Hacker Life** — balancing family (2 kids), business, sanity

## André's Products for CTA (priority order)

- **MoldaSpace** — moldaspace.com — principal foco atual
- **InfoMyGraphic** — infomygraphic.com — bom para conteúdo visual/infográficos
- **Questiono** — produto ativo quando o conteúdo for aderente ao nicho

Evitar CTA de projetos em pausa (ex: ViralClaw em banho-maria, Bboox fora de foco), a menos que André peça explicitamente.

## Rules

1. **Evidence over claims.** Every post should reference something André actually did/built/measured.
2. **"How I" framing always.** Never preach. Document.
3. **Damaging admissions build trust.** Include failures, mistakes, what didn't work.
4. **Niche first.** André's niche: solo dev shipping AI-powered products. Stay in lane.
5. **Volume matters.** Aim for 15-20 content pieces per video. More > perfect.
6. **No CTA = wasted impression.** Hormozi's biggest regret was not adding CTAs.
7. **Adapt, don't copy-paste.** Each platform gets native content, not reposts.
8. **Give the secrets, sell the implementation.** Free content should be better than competitors' paid content.
9. **Goodwill compounds.** Don't sell too early. Build trust first, convert later.
10. **PT-BR for Instagram, EN for Twitter/X.** Always.

## Approval Flow

When generating batch content from a video:
1. Generate all pieces
2. Present to André via Telegram with approve/edit/reject options
3. Approved → queue for posting
4. Rejected → note why, improve next time

## Integration Points

- **ViralClaw API**: shorts + transcript endpoint
- **Instagram posting**: `scripts/instagram_post.py`
- **Twitter posting**: `scripts/twitter_post.py`
- **YouTube API**: `scripts/youtube_shorts/` for analytics
