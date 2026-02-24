---
name: linear-ops
description: Manage Linear for non-development operations workflows. Use when creating, listing, updating, and reviewing Linear issues for ops/growth/process management (not software development tasks).
---

# Linear Ops

Use this skill to run MoldaSpace operational workflow in Linear.

## Scope

- Use Linear for non-dev operations: content, SEO, community, conversion, analytics, partnerships.
- Keep development bugs/features in GitHub issues.

## Setup

1. Ensure API key exists at `~/.openclaw/.secrets/linear_api_key`.
2. Use script: `skills/linear-ops/scripts/linear_ops.py`.

## Default MoldaSpace IDs

- Team: `4bd7d6e4-5b0e-44fe-9070-7bc116657b6f` (`AND`)
- Project: `439c51cd-2512-47d0-aca5-adc4aca724af` (`Moldaspace`)

## Common commands

```bash
# Validate auth and show IDs
python3 skills/linear-ops/scripts/linear_ops.py whoami
python3 skills/linear-ops/scripts/linear_ops.py ids

# Create task
python3 skills/linear-ops/scripts/linear_ops.py create \
  --title "Testar novo CTA da landing" \
  --label conversion \
  --kpi "+1.0pp em trial->paid" \
  --owner "André Prado" \
  --due 2026-02-28

# List tasks
python3 skills/linear-ops/scripts/linear_ops.py list --project Moldaspace --state "In Progress"

# Move task to another state
python3 skills/linear-ops/scripts/linear_ops.py move --issue AND-123 --state Done
```

## Recommended template body

Use this description format when creating issues:

- Objetivo
- KPI esperado
- Owner
- Prazo
- Checklist
