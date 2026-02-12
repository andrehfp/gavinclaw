# TUS Resumable Upload Integration - ViralClaw API

## Overview
Replace the current single-request file upload in `/generate-shorts` with tus.io resumable uploads, allowing agents to upload large video files (500MB-2GB) reliably with pause/resume support.

## Current Flow
1. Agent sends `POST /api/v1/generate-shorts` with `file` (multipart) or `url`
2. File streams directly to R2 via `upload_stream_to_r2()` in the request handler
3. Job is created and queued

## New Flow (TUS)
1. Agent creates upload: `POST /api/v1/uploads` → gets `upload_id` + `upload_url`
2. Agent uploads chunks via TUS protocol: `PATCH /api/v1/uploads/{upload_id}` (resumable)
3. On completion, file is in R2 at `uploads/{upload_id}/original.{ext}`
4. Agent submits job: `POST /api/v1/generate-shorts` with `upload_id` (instead of file)
5. Job uses the already-uploaded file from R2

## Technical Plan

### 1. New dependency
- `tuspy` or implement TUS core protocol manually (it's simple: HEAD to check offset, PATCH to append)
- Recommend: manual implementation (fewer deps, ~150 lines, full control)

### 2. New router: `routers/uploads.py`

#### `POST /api/v1/uploads` — Create upload
- Auth: API key required
- Body: `{ "filename": "video.mp4", "size": 1234567890, "content_type": "video/mp4" }`
- Validates: extension, size limit per plan
- Creates upload record in DB (new table `uploads`)
- Returns: `{ "upload_id": "abc123", "upload_url": "/api/v1/uploads/abc123", "expires_at": "..." }`

#### `HEAD /api/v1/uploads/{upload_id}` — Check upload status
- Returns headers: `Upload-Offset`, `Upload-Length`, `Tus-Resumable: 1.0.0`

#### `PATCH /api/v1/uploads/{upload_id}` — Upload chunk
- Headers: `Upload-Offset`, `Content-Type: application/offset+octet-stream`, `Tus-Resumable: 1.0.0`
- Appends chunk to R2 using multipart upload
- Returns: updated `Upload-Offset`

#### `OPTIONS /api/v1/uploads` — TUS discovery
- Returns TUS capabilities headers

### 3. New DB model: `Upload`
```python
class Upload(Base):
    __tablename__ = "uploads"
    id = Column(String, primary_key=True, default=generate_uuid)
    api_key_id = Column(Integer, ForeignKey("api_keys.id"))
    filename = Column(String)
    size = Column(BigInteger)  # Total expected size
    offset = Column(BigInteger, default=0)  # Current upload offset
    content_type = Column(String)
    r2_key = Column(String)  # R2 object key
    r2_upload_id = Column(String)  # S3 multipart upload ID
    status = Column(String, default="uploading")  # uploading | complete | expired | failed
    parts = Column(JSON, default=list)  # S3 multipart parts [{PartNumber, ETag}]
    created_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime)  # Auto-expire incomplete uploads after 24h
```

### 4. Storage changes: `services/storage.py`
Add multipart upload support:
- `create_multipart_upload(r2_key, content_type) -> upload_id`
- `upload_part(r2_key, upload_id, part_number, body) -> etag`
- `complete_multipart_upload(r2_key, upload_id, parts)`
- `abort_multipart_upload(r2_key, upload_id)`

### 5. Modify `routers/shorts.py`
Add `upload_id` as alternative input:
```python
upload_id: str | None = Form(default=None),
```
When `upload_id` is provided:
- Look up Upload record, verify status=complete and ownership
- Use `r2://{upload.r2_key}` as source_input_url
- Skip file upload logic

### 6. Cleanup cron
- Expire incomplete uploads after 24h
- Abort S3 multipart uploads for expired records
- Can be a simple background task or cron job

### 7. Skill update
Update the OpenClaw ViralClaw skill to use TUS upload:
- Check file size
- Create upload via POST
- Upload in 10MB chunks with resume on failure
- Submit job with upload_id

## Files to modify/create
- **CREATE** `routers/uploads.py` — TUS upload endpoints
- **MODIFY** `routers/shorts.py` — Accept `upload_id` parameter
- **MODIFY** `db/models.py` — Add Upload model
- **MODIFY** `services/storage.py` — Add multipart upload functions
- **MODIFY** `main.py` — Register uploads router
- **CREATE** `tests/test_uploads.py` — Tests
- **CREATE** Alembic migration for uploads table

## R2/S3 Multipart Upload Strategy
Instead of buffering chunks to disk, use S3 multipart upload:
1. On `POST /uploads`: `create_multipart_upload()` → get S3 upload ID
2. On each `PATCH`: `upload_part()` with the chunk → store ETag
3. On final PATCH (offset == size): `complete_multipart_upload()` → file assembled in R2
4. On expiry: `abort_multipart_upload()` → cleanup

Minimum S3 part size: 5MB (except last part). Use 10MB chunks as default.

## Chunk size recommendation for agents
- Default: 10MB chunks
- Large files (>1GB): 25MB chunks
- Retry: 3 attempts per chunk with exponential backoff
