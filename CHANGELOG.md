# Changelog

## 2026-02-07
- Hardened client scripts (`scripts/add_captions.py`, `scripts/check_credits.py`, `scripts/detect_moments.py`) by sanitizing HTTP error output and avoiding raw API body disclosure.
- Enforced secure API transport by requiring `VIRALCLIP_API_URL` to use `https://`, with explicit `--insecure` opt-in for local `http://` usage.
- Replaced broad config-loading exception handling with specific exceptions and warning logs.
- Added client-side input validation for URL fields (`video_url`, `webhook_url`) and enforced `count` bounds (`1..20`) in moment detection.
- Added config file permission checks with warnings when config files are too permissive.
