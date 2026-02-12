# ViralClaw Worker Architecture Analysis

**Date:** 2026-02-10

## Current Architecture

```
API (FastAPI) → Redis Sorted Set (priority queue) → Single Worker → R2 Upload → Webhook/DB
```

1. **API** receives job request, writes to Postgres, pushes to Redis sorted set (`jobs:queue`) with priority score
2. **Redis Queue** (`RedisQueue`): sorted set for ordering (high/normal/low priority), separate keys for payload/status/result, processing set with deadlines for orphan recovery
3. **Worker** (`worker.py`): single async event loop, `zpopmin` to dequeue one job at a time, processes it synchronously via `asyncio.to_thread()`, uploads outputs to R2, updates DB + webhook
4. **Background tasks**: heartbeat (15s), orphan job recovery (10s sweep), upload cleanup

## Key Finding: Already Supports Multiple Workers

The architecture is **already designed for parallel processing**. Redis `zpopmin` is atomic — multiple workers can safely compete for jobs without double-processing. Each worker gets a unique `WORKER_ID`, has its own heartbeat, and the orphan recovery handles crashed workers.

**No code changes needed** for horizontal scaling.

## Bottlenecks

1. **Single worker instance** — only 1 systemd unit running, processes jobs sequentially
2. **CPU-bound FFmpeg** — video processing uses `asyncio.to_thread()` but still blocks one core per job
3. **30-min timeout per job** (`JOB_TIMEOUT_SECONDS = 1800`) — long jobs block the worker
4. **Shared filesystem** — workers use same `APP_WORKDIR` and output dirs (works fine if job IDs are unique, which they are)

## Scaling Options (Ranked by Effort)

### Option A: Multiple Systemd Workers ⭐ RECOMMENDED — ~5 minutes

A template unit already exists at `deploy/viralclaw-worker@.service`. Just adapt it for local paths:

```bash
# Create template unit
sudo cp /etc/systemd/system/viralclaw-worker.service /etc/systemd/system/viralclaw-worker@.service
```

Edit `/etc/systemd/system/viralclaw-worker@.service`:
```ini
[Unit]
Description=ViralClaw Worker %i
After=viralclaw-api.service

[Service]
Type=simple
User=andreprado
WorkingDirectory=/home/andreprado/Projects/viralclaw-api
EnvironmentFile=/home/andreprado/Projects/viralclaw-api/.env
Environment=WORKER_ID=worker-%i
ExecStart=/home/andreprado/Projects/viralclaw-api/.venv/bin/python worker.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl stop viralclaw-worker  # stop old single unit
sudo systemctl disable viralclaw-worker
sudo systemctl daemon-reload
sudo systemctl enable --now viralclaw-worker@{1..3}  # start 3 workers
```

**Code changes needed:** None. Zero.

**Caveats:** Monitor CPU/RAM — each worker can peg a core during FFmpeg. For this i5 server, 2-3 workers is probably the sweet spot.

### Option B: Docker Compose Scale — ~10 minutes

Already supported by the existing `docker-compose.yml`. The worker service has no port binding, so scaling is trivial:

```bash
docker compose up -d --scale worker=3
```

**Code changes needed:** None.

**Caveats:** You're currently running bare-metal (systemd), not Docker. Switching to Docker adds overhead and complexity. Only worth it if you want containerized deployment.

### Option C: Modal.com Serverless — ~1-2 days

Would require extracting the job processing logic into a Modal function:

1. Create `modal_worker.py` with `@modal.function(gpu=False, cpu=4, memory=8192, timeout=1800)`
2. The Modal function would: download from R2, process, upload back to R2, update DB via API call
3. A lightweight dispatcher replaces the current worker: pops from Redis, calls `modal_fn.spawn(job_id, payload)`
4. Need to handle DB updates via API endpoint (Modal can't access local Postgres)
5. Need to bundle FFmpeg + Python deps in Modal image

**Code changes needed:**
- New `modal_worker.py` (~200 lines)
- New API endpoint for worker→API status updates
- Modified dispatcher (~50 lines)

**Pros:** Auto-scales to zero, burst to many, no server load
**Cons:** Significant refactor, cold starts, network latency for R2 downloads, cost per invocation

## Recommendation

**Option A — systemd template units.** Zero code changes, 5 minutes to deploy, and the architecture already supports it perfectly. Start with 2 workers, monitor with `journalctl -u 'viralclaw-worker@*' -f`, scale up if CPU allows.
