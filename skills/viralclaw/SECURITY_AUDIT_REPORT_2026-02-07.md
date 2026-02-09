# ViralClaw Security Audit Report
Date: 2026-02-07
Auditor: Codex
Scope: All Python files in this repository.
Files reviewed:
- scripts/add_captions.py
- scripts/check_credits.py
- scripts/detect_moments.py

## Executive Summary
This repository does not contain the ViralClaw API server implementation. It contains only client-side helper scripts. Because of that, critical backend controls (auth enforcement, authorization checks, credit race-condition handling, webhook signature verification, CORS/headers, LemonSqueezy validation) cannot be verified from code evidence here.

Within the reviewed scripts, multiple security weaknesses exist around error leakage, trust of configurable API endpoints, and missing client-side input guardrails.

## Findings

### 1) Critical - Backend/API security controls are not auditable from this codebase
Category: Authentication & Authorization, Rate Limiting, Credit System Security, API Design, Payment Integration

Evidence:
- Only three local client scripts exist; no API server code, middleware, DB transaction code, webhook handlers, or LemonSqueezy integration logic is present.

Risk:
- High-impact controls requested in this audit cannot be validated. Vulnerabilities may exist in production without visibility.

Recommended fix:
- Add backend source (or a security design package) for review, including:
- Auth middleware, key/JWT validators, permission checks.
- Rate limiting implementation.
- Credit deduction transaction logic.
- LemonSqueezy webhook verifier and replay defense.
- CORS/security header configuration.

### 2) High - Raw backend error bodies are printed directly to users
Category: Error Handling / Information Disclosure

Evidence:
- scripts/check_credits.py:45
- scripts/detect_moments.py:47
- scripts/add_captions.py:61

Risk:
- If API returns stack traces, SQL errors, internal hostnames, request IDs, or debug payloads, these scripts expose them directly.

Recommended fix:
- Replace raw body output with sanitized messages.
- Optionally show a short safe error code and write full diagnostics only in a protected debug log.

### 3) High - API endpoint is fully overrideable without transport security enforcement
Category: Authentication / Secrets Handling

Evidence:
- scripts/check_credits.py:13
- scripts/detect_moments.py:14
- scripts/add_captions.py:16

Risk:
- `VIRALCLIP_API_URL` can point to non-HTTPS endpoints, enabling API key exposure over plaintext or to malicious hosts.

Recommended fix:
- Enforce `https://` scheme in code before requests.
- Allow non-HTTPS only behind an explicit `--insecure` flag for local dev.
- Consider host allowlisting for production usage.

### 4) Medium - Broad exception swallowing while loading API keys
Category: Secrets Management / Hardening

Evidence:
- scripts/check_credits.py:26-27
- scripts/detect_moments.py:27-28
- scripts/add_captions.py:34-35

Risk:
- Silent failure hides malformed/tampered config and weakens detection of local compromise or misconfiguration.

Recommended fix:
- Catch specific exceptions (`FileNotFoundError`, `json.JSONDecodeError`, `PermissionError`) and log sanitized warnings.

### 5) Medium - Unvalidated user-controlled URLs passed to backend jobs
Category: Input Validation / SSRF Abuse Surface

Evidence:
- scripts/add_captions.py:72,77,109,112
- scripts/detect_moments.py:59,72

Risk:
- Scripts accept arbitrary `video_url` and `webhook_url` and forward them. If server-side validation is weak, this can facilitate SSRF against internal services.

Recommended fix:
- Add client-side guardrails (scheme/domain validation) and reject obvious local/internal targets.
- On server side, enforce strict URL allow/deny policies and network egress controls.

### 6) Medium - Missing client-side bounds on expensive parameters
Category: Rate Limiting / Abuse Prevention / Credit Protection

Evidence:
- scripts/detect_moments.py:60,73 (`count` has no min/max clamp)

Risk:
- Users can request extreme values, potentially increasing backend cost and queue pressure if server controls are insufficient.

Recommended fix:
- Clamp `count` to a safe range client-side (for example `1..20`).
- Keep server-side limits authoritative.

### 7) Low - API key read from potentially world-readable local config files
Category: Secrets Management

Evidence:
- scripts/check_credits.py:18,22-24
- scripts/detect_moments.py:19,23-25
- scripts/add_captions.py:25-33

Risk:
- If `~/.openclaw/config.json` permissions are weak, local users/processes can steal API keys.

Recommended fix:
- Validate file permissions before reading secrets (owner-only preferred).
- Document secure permission requirements.

### 8) Low - No request correlation IDs or secure logging strategy
Category: General Best Practices

Evidence:
- All scripts print directly to stdout/stderr and do not include structured, redacted logs.

Risk:
- Makes incident triage harder and encourages ad-hoc logging of sensitive payloads.

Recommended fix:
- Add optional structured logging with redaction of keys/tokens/URLs containing secrets.

## Category-by-Category Assessment

1. Authentication & Authorization
- Client sends API key header correctly.
- No JWT/session logic exists in audited files.
- Cannot verify server-side authz enforcement without backend code.

2. Rate Limiting
- No client-side throttle/backoff and no evidence of server rate-limit behavior in this repo.

3. Input Validation
- No validation for `video_url`/`webhook_url`/`count` before submission.
- No direct SQL/command/file-path handling in these scripts.

4. Credit System Security
- No credit deduction logic is present locally.
- Race-condition safety cannot be evaluated without DB transaction code.

5. Error Handling
- Sensitive error leakage risk exists via raw HTTP body prints.

6. Dependency Security
- Python scripts use standard library only.
- No third-party Python dependencies declared in this repo.

7. File Handling
- Local file handling limited to reading config files.
- No temp file operations; no upload path or symlink handling code present.

8. API Design
- CORS/security headers are server concerns and not visible here.
- Client allows arbitrary API base URL override.

9. Payment Integration (LemonSqueezy)
- No LemonSqueezy/webhook verification code found in repository.
- Replay protection cannot be confirmed.

10. General Best Practices
- Missing strict exception handling and secret-safe diagnostics.
- No debug-mode guardrails evident.

## Priority Fix Plan
1. Obtain and audit API backend code (blocker for full security assurance).
2. Sanitize all HTTP error outputs in client scripts.
3. Enforce HTTPS and optionally allowlist API hostnames.
4. Add input bounds/validation for URL fields and `count`.
5. Replace broad exception swallowing with explicit exception handling.
6. Add secure config permission checks and redacted structured logging.

## Notes
- This report is evidence-based from repository contents only.
- Claims about backend vulnerabilities were not made without code evidence; backend-related items are flagged as unverified scope gaps.
