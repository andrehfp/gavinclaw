# Gavin Replication Manifest

Objetivo: permitir clonar o "Gavin OS" em qualquer máquina com OpenClaw.

## Canonical blocks

### Identity & behavior
- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `AGENTS.md`
- `HEARTBEAT.md`

### Memory layer
- `MEMORY.md`
- `memory/active-tasks.md`
- `memory/*.md` (últimos contextos)

### Operational playbooks
- `TOOLS.md`
- `tasks.json`
- `goals.json`
- `todos.json`

### Skills
- `skills/`
- `SKILL.md`
- `*.skill`

### Automation
- `scripts/`

## What not to replicate by default
- Secrets (`~/.openclaw/.secrets/*`)
- Credentials (`~/.openclaw/credentials/*`)
- Large media outputs (`shorts_output/`, render blobs)
- Local caches / venvs / node_modules

## Required manual post-step
- Reconnect channels (WhatsApp, Telegram if needed)
- Re-add secrets keys
- Validate cron jobs on target host
