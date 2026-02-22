# Security Policy

## Reporting a Vulnerability

If you find a security vulnerability or safety-critical issue, please submit a **Pull Request** with:

- A clear description of the issue and its impact
- The affected component(s)
- Minimal reproduction steps
- Your suggested fix

For sensitive vulnerabilities that should not be disclosed publicly before a fix is available, use [GitHub's private vulnerability reporting](https://github.com/vibeforge1111/vibeship-spark-intelligence/security/advisories/new) or email `security@vibeship.co`.

## Scope

This repo handles:
- Local event capture (Claude Code hooks)
- Processing and memory/distillation loops (Spark / EIDOS)
- Local dashboards and notifications

Security-sensitive areas:
- Hook inputs (prompt injection via tool metadata)
- Any code execution surfaces (shell/tool runners)
- Any network clients (Mind bridge, notify/wake endpoints)
- Any persisted files under `~/.spark/`

## Response Timeline

- Acknowledge: within 72 hours
- Initial assessment: within 7 days
- Patch target for critical issues: 14 days (best-effort)

## Hard Rules

- Never ask reporters to publish exploit details before a fix is available.
- Never request real secrets from reporters.
