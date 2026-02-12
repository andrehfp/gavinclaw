# ViralClaw Multi-Format Content Repurposing — Technical Plan

## Vision
One video → 20+ content pieces across all formats.
Reuse existing infrastructure: transcription (Whisper), moment detection (LLaMA), captions engine.

---

## Phase 1: Carrosséis (Instagram/LinkedIn)

### New Files
- `services/carousel_generator.py` — Core carousel generation logic
- `routers/carousel.py` — API endpoint
- `models/carousel.py` — Request/response models

### How it works
1. Reuse `detect_viral_moments_with_words()` from viral_moments.py → get moments + transcription
2. For each moment, extract:
   - **Key quote** (most impactful sentence from transcription)
   - **Best frame** (ffmpeg: extract frame at moment's peak/hook timestamp)
3. Generate slides using Pillow (PIL):
   - Slide 1: Hook/title slide with bold text
   - Slides 2-8: Frame + overlaid quote text (branded, consistent style)
   - Last slide: CTA slide ("Follow for more", etc.)
4. Output: ZIP with PNGs or single PDF
5. Upload to R2, return signed URLs

### Slide Styles (like caption styles)
- `corporate` — Clean, LinkedIn-friendly, dark bg + white text
- `bold` — MrBeast/hormozi style, bright colors, big text
- `minimal` — White bg, elegant typography
- `gradient` — Gradient backgrounds with quote overlay

### API Endpoint
```
POST /api/v1/generate-carousel
Body (form):
  - file/url/upload_id: video source (same as generate-shorts)
  - slide_count: 5-10 (default 7)
  - style: corporate|bold|minimal|gradient
  - language: optional
  - webhook_url: optional
  - webhook_token: optional

Response: { job_id, message }
```

### Worker Integration
Add `operation: "generate_carousel"` handler in worker.py, following same pattern as `generate_shorts`.

### Cost: 2 credits per carousel

### Dependencies
- `Pillow` (image generation) — add to requirements.txt
- Existing: ffmpeg, Groq (Whisper + LLaMA)

---

## Phase 2: Threads/Posts Virais (Twitter/X, LinkedIn)

### New Files
- `services/thread_generator.py` — Thread/post generation
- `routers/threads.py` — API endpoint
- `models/thread.py` — Request/response models

### How it works
1. Reuse transcription from viral_moments (Whisper)
2. Send transcription to LLaMA with prompt:
   - "Extract 5-10 viral tweet-sized insights from this transcript"
   - "Format as a Twitter thread with hooks, insights, and CTA"
   - "Also generate a LinkedIn post version (longer, more professional)"
3. Return structured JSON:
   ```json
   {
     "twitter_thread": ["tweet1", "tweet2", ...],
     "linkedin_post": "Full formatted post...",
     "quote_snippets": ["best quote 1", "best quote 2", ...]
   }
   ```

### API Endpoint
```
POST /api/v1/generate-thread
Body (form):
  - file/url/upload_id: video source
  - platform: twitter|linkedin|both (default both)
  - tone: professional|casual|provocative (default casual)
  - language: optional
  - webhook_url/webhook_token: optional

Response: { job_id, message }
```

### Cost: 1 credit per thread

### Dependencies
- Existing only: Groq (Whisper + LLaMA)

---

## Phase 3: Quote Cards

### New Files
- `services/quote_card_generator.py` — Quote card image generation
- `routers/quote_cards.py` — API endpoint
- `models/quote_card.py` — Request/response models

### How it works
1. Reuse transcription
2. LLaMA extracts top 3-5 most impactful quotes
3. For each quote, generate image (Pillow):
   - Background: gradient, blur of video frame, or solid color
   - Quote text: large, centered, with attribution
   - Branding: optional logo/watermark
4. Output: ZIP with PNGs (1080x1080 for Instagram, 1080x1920 for Stories)

### API Endpoint
```
POST /api/v1/generate-quote-cards
Body (form):
  - file/url/upload_id: video source
  - count: 3-5 (default 3)
  - format: square|story|both (default both)
  - style: gradient|frame-blur|solid
  - language: optional

Response: { job_id, message }
```

### Cost: 1 credit per pack (3-5 cards)

---

## Phase 4: Audiogramas

### New Files
- `services/audiogram_generator.py` — Audiogram video generation
- `routers/audiograms.py` — API endpoint

### How it works
1. Extract audio clip from viral moment (ffmpeg)
2. Generate waveform visualization (ffmpeg + PIL)
3. Overlay captions (reuse viral_captions engine)
4. Compose: waveform + captions + title bar = 60s video
5. Output: MP4 (1080x1080 or 9:16)

### API Endpoint
```
POST /api/v1/generate-audiogram
Body (form):
  - file/url/upload_id: video/audio source
  - count: 1-5 (default 3)
  - style: waveform|bars|circle
  - language: optional

Response: { job_id, message }
```

### Cost: 2 credits per audiogram

---

## Phase 5: Mega Endpoint — "Repurpose All"

### New Endpoint
```
POST /api/v1/repurpose
Body (form):
  - file/url/upload_id: video source
  - formats: ["shorts", "carousel", "thread", "quote_cards", "audiogram"]
  - shorts_count: 5
  - carousel_style: bold
  - thread_platform: both
  - language: optional

Response: { job_id, message, estimated_credits: 15 }
```

One video → spawns sub-jobs for each format → returns everything via webhook or polling.

### Cost: Sum of individual formats (discount: -10% for bundle)

---

## Implementation Order (for Codex)

### Batch 1 — Carousel (most visual impact, reuses most infra)
1. Create `models/carousel.py`
2. Create `services/carousel_generator.py` 
3. Create `routers/carousel.py`
4. Add worker handler for `generate_carousel`
5. Register router in `main.py`
6. Add Pillow to requirements.txt
7. Tests

### Batch 2 — Threads (easiest, LLM-only)
1. Create `models/thread.py`
2. Create `services/thread_generator.py`
3. Create `routers/threads.py`
4. Add worker handler
5. Register router
6. Tests

### Batch 3 — Quote Cards
1. Create `models/quote_card.py`
2. Create `services/quote_card_generator.py`
3. Create `routers/quote_cards.py`
4. Worker handler + router registration
5. Tests

### Batch 4 — Audiograms + Mega Endpoint
1. Audiogram service + router
2. Repurpose mega endpoint
3. Integration tests

---

## Shared Infrastructure to Extract

Before starting, refactor these shared components:
- `services/transcription.py` — Extract Whisper transcription from viral_moments.py into reusable module
- `services/frame_extractor.py` — Extract best frames from video at given timestamps (ffmpeg)
- `services/image_renderer.py` — Pillow-based image generation (shared by carousel + quote cards)

This avoids code duplication across all new services.

---

## DB Changes
Add to Job model's operation enum: `generate_carousel`, `generate_thread`, `generate_quote_cards`, `generate_audiogram`, `repurpose`

Migration: `db/migrations/0007_multiformat_operations.sql`
