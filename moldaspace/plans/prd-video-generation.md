# PRD: AI Video Generation for MoldaSpace

**Author:** Gavin (AI) + André Prado
**Date:** 2026-02-17
**Status:** Draft
**GitHub Issue:** TBD

---

## 1. Problem Statement

Architects, interior designers, and real estate professionals pay **$1,500-$10,000+ per second** for traditional 3D architectural animations. Even simple walkthroughs cost $5,000-$50,000+ per minute. Virtual staging videos are essentially inaccessible to small studios and freelance designers.

MoldaSpace already generates photorealistic renders from sketches. Adding AI video generation creates a natural upsell that turns static renders into immersive experiences at a fraction of traditional costs.

## 2. Target Users

| Persona | Use Case | Current Pain |
|---------|----------|-------------|
| **Interior Designer** | Client presentations, social media content | Pays $2,000+ for a 10s walkthrough or does without |
| **Architect** | Project proposals, planning approvals | Static renders don't convey spatial flow |
| **Real Estate Agent** | Property listings, virtual tours | Professional video staging costs $500-1,000/room |
| **Archviz Freelancer** | Portfolio content, Instagram/TikTok | Spends hours in Unreal/D5 Render for a simple pan |
| **Interior Design Student** | Coursework, portfolio building | Can't afford any animation tools |

## 3. Video Types

Based on research of what architects and designers actually use:

### 3.1 Interior Walkthrough (Camera Pan)
**What:** Smooth camera movement through a rendered interior space. Dolly, pan, or orbit around the room.
**Use case:** Client presentations, social media reels, property listings.
**Model:** Wan 2.2 ($0.40/5s) — tested, quality proven.
**Input:** Single render image.
**Why it matters:** The #1 most requested archviz video type. Shows spatial flow, lighting, and materials in motion.

### 3.2 Sketch-to-Render Transformation
**What:** Animated transition from a B&W architectural sketch to a full photorealistic render.
**Use case:** Design process storytelling, Instagram reels, client "wow" moments, portfolio showcases.
**Model:** Veo 3.1 ($1.60/8s) — tested, quality proven with reference images.
**Input:** Sketch image + render image (both as references) + transformation prompt.
**Why it matters:** Viral content format. Shows the "magic" of the design process. High engagement on social media.

### 3.3 Style Comparison (A→B Morph)
**What:** Smooth transition between two different design styles of the same room (e.g., minimalist → industrial, modern → scandinavian).
**Use case:** Showing design options to clients, "which do you prefer?" social content.
**Model:** Veo 3.1 ($1.60/8s) — same reference-based approach as sketch-to-render.
**Input:** Two render images of the same room in different styles.
**Why it matters:** Designers frequently present 2-3 style options. Video transitions are more compelling than side-by-side statics.

### 3.4 Day-to-Night Transition
**What:** Animated lighting change from daylight to evening/night ambiance in the same room.
**Use case:** Showcasing lighting design, mood transitions, hospitality projects.
**Model:** Wan 2.2 ($0.40/5s) or Veo 3.1 ($1.60/8s) — needs testing.
**Input:** Single render + prompt describing lighting transition.
**Why it matters:** Lighting design is a huge differentiator. Shows how a space transforms between day and night.

### 3.5 Empty Room → Staged Room (Virtual Staging)
**What:** Empty/unfurnished room gradually fills with furniture and decor.
**Use case:** Real estate agents staging properties, before/after marketing.
**Model:** Veo 3.1 with two reference images (empty + furnished). Needs further testing.
**Input:** Empty room photo + staged render.
**Why it matters:** Virtual staging market is $150-300/room for STILLS. Video staging is premium upsell.

### 3.6 Exterior Flythrough
**What:** Aerial or ground-level camera movement around a building exterior.
**Use case:** Real estate development marketing, project proposals.
**Model:** Wan 2.2 ($0.40/5s) — camera movement is its strength.
**Input:** Single exterior render.
**Why it matters:** Standard deliverable for any real estate development project.

## 4. Pricing

### Recommended: 6 credits per video (promotional launch price)

| Plano | Valor/crédito | Receita/vídeo | Custo Wan | Margem Wan | Custo Veo | Margem Veo |
|-------|--------------|---------------|-----------|------------|-----------|------------|
| Starter (10/$6) | $0.60 | $3.60 | $0.40 | **89%** | $1.60 | **56%** |
| Standard (40/$19) | $0.475 | $2.85 | $0.40 | **86%** | $1.60 | **44%** |
| Monthly (50/$19/mo) | $0.38 | $2.28 | $0.40 | **82%** | $1.60 | **30%** |

**Market context:** Traditional architectural animation costs $1,500-$5,000/second. MoldaSpace at $2.28-$3.60 per 5-8s video is a **99.9% cost reduction**.

### Future pricing strategy
- Launch at 6 credits ("promotional price")
- After launch validation, consider:
  - Standard video (Wan, 5s pan): 4 credits
  - Premium video (Veo, 8s transformation): 8 credits
- Room to increase to 8-10 credits post-promo

## 5. Technical Architecture

### 5.1 Backend API

```
POST /api/video/generate
{
  "project_id": "uuid",
  "video_type": "walkthrough" | "sketch_to_render" | "style_morph" | "day_night" | "staging" | "exterior",
  "source_image_url": "https://...",          // Primary render
  "reference_image_url": "https://...",       // Optional: sketch, empty room, alt style
  "prompt_override": "...",                   // Optional: custom camera/motion instructions
  "duration": 5 | 8                           // 5s (Wan) or 8s (Veo)
}
```

### 5.2 Model Selection Logic

| Video Type | Primary Model | Fallback | Cost |
|-----------|--------------|----------|------|
| walkthrough | Wan 2.2 (720p) | Veo 3.1 | $0.40 |
| sketch_to_render | Veo 3.1 (720p) | — | $1.60 |
| style_morph | Veo 3.1 (720p) | — | $1.60 |
| day_night | Wan 2.2 (720p) | Veo 3.1 | $0.40 |
| staging | Veo 3.1 (720p) | — | $1.60 |
| exterior | Wan 2.2 (720p) | Veo 3.1 | $0.40 |

### 5.3 Pipeline

```
User clicks "Generate Video" on project page
  → Check credits (need 6)
  → Deduct credits
  → Upload source image(s) to fal.ai storage
  → Submit to appropriate model via fal.ai API
  → Poll for completion (Wan: ~50s, Veo: ~90s)
  → Download result to R2/S3
  → Store video URL in project record
  → Notify user (email + in-app)
  → Show video on project page with download button
```

### 5.4 Prompt Templates

Each video type has a default prompt template optimized through testing:

**Walkthrough:**
```
A slow cinematic camera {movement} across this {room_type}. 
{lighting_description}. Subtle ambient details like dust particles 
in light beams. Photorealistic, architectural visualization, 
cinematic quality.
```
Variables: `movement` (dolly forward, pan left-to-right, orbit), `room_type` (from project), `lighting_description` (from render analysis).

**Sketch-to-Render:**
```
The video starts showing a black and white pencil sketch of a 
{room_type} interior. Over {duration} seconds, the sketch lines 
gradually dissolve and the scene transforms into a warm photorealistic 
render with {materials_description}. The camera stays static. 
The transformation is smooth and organic.
```

**Style Morph:**
```
A {room_type} interior smoothly transitions from {style_a} design 
to {style_b} design. Materials, colors, and furniture transform 
fluidly. The camera stays static. Cinematic, architectural visualization.
```

### 5.5 Integration Points

- **fal.ai API**: Video generation (FAL_KEY stored server-side)
- **R2/S3**: Video storage (same bucket as renders)
- **Project page**: New "Videos" tab alongside renders
- **Credit system**: Deduct 6 credits on generation start
- **Email**: Notification when video is ready (optional)

## 6. UX Flow

### 6.1 Entry Point: Post-Render Upsell
After a user generates a render, show a CTA:

```
┌─────────────────────────────────────────────┐
│  🎬 Bring this render to life!              │
│                                              │
│  Generate a cinematic walkthrough video      │
│  of your design in seconds.                  │
│                                              │
│  [Generate Video - 6 credits]               │
│                                              │
│  ⭐ Launch promo: normally 10 credits        │
└─────────────────────────────────────────────┘
```

### 6.2 Video Type Selection
If user has both sketch and render:

```
Choose video type:
○ 🎥 Walkthrough — Cinematic camera pan through your space (5s)
○ ✏️ Sketch → Render — Watch your sketch transform into reality (8s)  
○ 🎨 Style Comparison — Morph between two design styles (8s)
```

### 6.3 Processing State
```
🎬 Generating your video...
━━━━━━━━━━━━━━━━━━━━ 60%
Estimated time: ~1 minute

Tip: Your video will also be sent to your email!
```

### 6.4 Result
```
┌─────────────────────────────────────────────┐
│  [VIDEO PLAYER - autoplay, loop]            │
│                                              │
│  [⬇️ Download MP4]  [🔄 Regenerate]        │
│  [📱 Share]                                  │
└─────────────────────────────────────────────┘
```

## 7. MVP Scope (v1)

### In Scope
- [ ] **Walkthrough video** (Wan 2.2) — single render input, camera pan
- [ ] **Sketch-to-render video** (Veo 3.1) — sketch + render reference images
- [ ] fal.ai integration (server-side API key)
- [ ] Credit deduction (6 credits)
- [ ] Video storage on R2
- [ ] Project page "Videos" section
- [ ] Post-render upsell CTA
- [ ] Basic video type selection UI

### Out of Scope (v2+)
- [ ] Style comparison / morph
- [ ] Day-to-night transition
- [ ] Empty→staged room
- [ ] Exterior flythrough
- [ ] Custom prompt editor
- [ ] Video length options (5s/8s/15s)
- [ ] Audio/music overlay
- [ ] HD/4K resolution upgrade
- [ ] Batch video generation
- [ ] Video gallery/portfolio page

## 8. Success Metrics

| Metric | Target (30 days post-launch) |
|--------|------------------------------|
| Video generation adoption | 15% of users who generate renders also generate video |
| Credit consumption increase | +20% overall credit usage |
| Revenue impact | +$50/month MRR from video-driven credit purchases |
| Social sharing | 10% of generated videos shared (tracked via share button) |
| NPS/satisfaction | "Video quality" rating ≥ 4/5 |

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| fal.ai downtime | Users can't generate videos | Show graceful error, offer retry, don't deduct credits on failure |
| Low video quality for some inputs | User dissatisfaction | AI-analyze render before generation, warn on low-quality inputs |
| High cost on Veo for Monthly users (30% margin) | Thin margins | Monitor cost/revenue ratio, adjust pricing or model selection if needed |
| Users expect 30s+ videos | Feature mismatch | Clear UI showing 5-8s duration, position as "video clips" not "full animations" |
| fal.ai pricing changes | Margin erosion | Abstract model selection, easy to swap providers |
| Credit refund requests for bad videos | Support overhead | Offer one free regeneration per video, clear preview of video type before generation |

## 10. Competitive Analysis

| Competitor | Video Feature | Price |
|-----------|--------------|-------|
| **Traditional archviz studios** | Full walkthroughs | $1,500-$10,000/second |
| **D5 Render** | Real-time walkthrough | $480/year subscription (manual work required) |
| **Enscape** | Real-time walkthrough | $529/year (requires 3D model) |
| **Lumion** | Cinematic animations | $1,499/year (requires 3D model) |
| **REimagineHome** | AI staging video | ~$30/video (limited styles) |
| **MoldaSpace** | AI video from render | **$2.28-$3.60/video** (no 3D model needed!) |

**Key differentiator:** MoldaSpace generates video from a single image. No 3D model, no Unreal Engine, no manual camera paths. Upload sketch → get render → get video. The entire pipeline costs less than one second of traditional animation.

## 11. Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|-------------|
| **Phase 1: Backend** | 2-3 days | fal.ai integration, video generation API, R2 storage, credit deduction |
| **Phase 2: Frontend** | 2-3 days | Video type selector, processing state, video player, download |
| **Phase 3: UX Polish** | 1-2 days | Post-render upsell CTA, email notification, error handling |
| **Phase 4: Testing** | 1 day | End-to-end testing, edge cases, credit rollback on failure |
| **Phase 5: Launch** | 1 day | Feature flag flip, announcement email, social media |

**Total: ~7-10 days for MVP**

## 12. Open Questions

1. **Should we store the fal.ai API key server-side only, or also allow users to bring their own key?** (Recommendation: server-side only for simplicity and margin control)
2. **Should failed video generations refund credits?** (Recommendation: yes, full refund on API error; offer free regeneration on "bad quality" complaints)
3. **Should we offer a free video to new users as part of the trial?** (Could be a powerful conversion tool — "See your sketch as a video!")
4. **Portrait vs landscape?** Renders are typically landscape (16:9), but social media favors portrait (9:16). Consider offering both orientations.
5. **Watermark on free trial videos?** Could add MoldaSpace watermark for free tier, remove for paid. Drives brand awareness.

---

## Appendix A: Model Test Results (Feb 17, 2026)

| Model | Type | Cost/video | Quality | Speed | Notes |
|-------|------|-----------|---------|-------|-------|
| **Wan 2.2** | Walkthrough/Pan | $0.40 (5s) | ⭐⭐⭐⭐ | 50s | Best for camera movement. Clean, smooth. 720p 32fps. |
| **Veo 3.1** | Sketch→Render | $1.60 (8s) | ⭐⭐⭐⭐ | 90s | Best for transformations with reference images. 720p 24fps. |
| **Kling 3.0 Pro** | Start→End interpolation | $1.12 (5s) | ⭐⭐⭐⭐⭐ | 16 min | Highest quality but extremely slow. 1764×1176. Not viable for UX. |
| **LTX-2 19B** | Camera LoRA | $0.02 (5s) | ⭐⭐ | 86s | Cheap but poor quality for archviz. Static or jerky motion. |

**Recommendation:** Wan 2.2 for walkthroughs, Veo 3.1 for transformations. Kling too slow for real-time UX.

## Appendix B: Prompt Templates Library

See `moldaspace/content/video-prompts.md` (to be created during implementation).
