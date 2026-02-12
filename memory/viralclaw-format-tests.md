# ViralClaw Format Tests - 2026-02-10

**Test video:** ForBiggerBlazes.mp4 (2.4MB, ~15s, minimal audio - just "Dracarys")
**API:** http://localhost:8101 | **Key:** internal (vc_4ee9...)
**Worker was dead on start**, had to `systemctl start viralclaw-worker`

## Results Summary

| # | Format | Job ID | Status | Verdict |
|---|--------|--------|--------|---------|
| 1 | **Shorts** | 43 | done ✅ | **PASS** (with caveats) |
| 2 | **Carousel** | 44 | DLQ (failed after 3 retries) ❌ | **FAIL** |
| 3 | **Threads** | 45 | done ✅ | **PASS** |
| 4 | **Quote Cards** | 46 | done ✅ | **PASS** |
| 5 | **Audiograms** | 47 | stuck processing ❌ | **FAIL** (worker crashed) |
| 6 | **Repurpose** | 48 | stuck processing ❌ | **FAIL** (carousel sub-job crashed) |

**Score: 3/6 PASS**

---

## Detailed Results

### 1. Shorts ✅ PASS (with caveats)
- **Job 43** completed in ~76s
- Produced 1 short (requested 2) - fallback segment since video too short for 30-90s moments
- Output uploaded to R2 with signed URL ✅
- Generated title, description, hashtags ✅
- **Caveat:** Only 1 short instead of requested 2 (expected for 15s source video)
- **Caveat:** Duration only 1.0s (should use full 15s?) - the "Fallback segment" logic seems too aggressive

### 2. Carousel ❌ FAIL
- **Job 44** failed 3x, moved to DLQ
- **Root cause:** `image_renderer.py:247` - `ValueError: quotes and frame_paths must have the same length`
  - The carousel generator extracts N quotes but produces a different number of video frames
  - With a 15s video, the frame extraction vs quote count gets mismatched
- **Secondary bug:** `transcript_cache.py` has a critical event loop bug - calling `asyncio.run()` inside a running event loop's thread pool executor. This corrupts the asyncpg connection pool and causes cascading failures.
- **Secondary bug:** After DLQ, job status stuck as "processing" in DB (should be "failed")

### 3. Threads ✅ PASS
- **Job 45** completed in ~4s (fastest format)
- Produced Twitter thread (5 tweets) + LinkedIn post + quote snippets
- Quality score: 5.36/10 (expected for "Dracarys" content)
- Used Groq LLM (llama-3.3-70b-versatile), cost: $0.00027
- **Note:** Content is repetitive ("Dracarys" x5) but that's the source material

### 4. Quote Cards ✅ PASS
- **Job 46** completed in ~20s
- Produced 2 cards (1 quote x 2 formats: square + story) + ZIP archive
- Cards uploaded to R2 with signed URLs ✅
- **Note:** Only 1 unique quote generated (requested 3) - source too short
- **Bug (minor):** `r2_key` field contains full signed URL instead of just the R2 key path

### 5. Audiograms ❌ FAIL (never processed)
- **Job 47** stuck in "processing" with null result
- Worker appears to have become corrupted after carousel job's event loop crash
- The asyncpg connection pool corruption from job 44 likely prevented job 47 from being picked up or completed
- **Root cause:** Same `transcript_cache.py` event loop bug causing worker instability

### 6. Repurpose ❌ FAIL
- **Job 48** stuck in "processing"
- Result shows carousel sub-job hit same `quotes and frame_paths must have the same length` error
- Credits were reserved (5 credits) but not refunded on failure
- **Root cause:** Carousel bug + worker instability

---

## Critical Bugs Found

### 🔴 P0: transcript_cache.py event loop corruption
**File:** `services/transcript_cache.py:20-22`
```python
def _run_async(coro):
    asyncio.get_running_loop()  # raises if no loop
    ...
    return asyncio.run(coro)  # THIS CREATES A NEW LOOP - BREAKS asyncpg
```
- Calling `asyncio.run()` from a thread pool executor that shares asyncpg connections corrupts the connection pool
- Causes cascading `RuntimeError: Event loop is closed` and `Future attached to a different loop`
- **Fix:** Use the worker's event loop via `asyncio.run_coroutine_threadsafe()` or pass the session from the caller

### 🔴 P0: Carousel frame/quote mismatch
**File:** `services/carousel_generator.py:362` → `services/image_renderer.py:247`
- When video has fewer frames than requested slides, `render_carousel_slides()` gets mismatched arrays
- **Fix:** Pad frames to match quotes, or reduce quotes to match available frames

### 🟡 P1: Failed jobs stuck as "processing"
- When `job_finalize_failed` occurs (due to DB connection corruption), the job never transitions to "failed"
- DLQ jobs show status "processing" in API response
- **Fix:** Add a fallback status update mechanism (e.g., Redis-based status or periodic cleanup)

### 🟡 P1: Quote card r2_key contains full URL
- The `r2_key` field in quote card results contains the full signed URL instead of the R2 path
- Minor data inconsistency with other formats

### 🟢 P2: Shorts fallback produces 1s clip
- When no 30-90s moments found, fallback creates a 1s clip instead of using full available duration
- Should produce a clip using the full video length (capped at max)

---

## Recommendations

1. **Fix transcript_cache.py immediately** - it's poisoning the worker's connection pool and causing cascading failures across ALL formats
2. **Fix carousel frame padding** - ensure frames and quotes arrays always match
3. **Add job status recovery** - periodic task to mark stale "processing" jobs as failed
4. **Test with longer video** - 15s "Dracarys" is an edge case; re-test with a 5-10min video for more realistic results
5. **Worker auto-restart** - after event loop corruption, the worker should self-heal or restart
