# 2026-02-11 — Melhorias Identificadas

## Skills a Criar

### social-media-poster Skill
**Justificativa:** Já tenho scripts `linkedin_post.py` e `twitter_post.py` mas sem skill estruturada.

**Funcionalidade:**
- Post direto no LinkedIn (PT-BR)
- Post direto no Twitter/X (EN) — quando tokens forem corrigidos
- Scheduling via cron
- Cross-platform strategy

**Localização proposta:** `skills/social-media-poster/`

## Fixes Aplicados

### MEMORY.md
- ✅ Corrigido VPS deploy info: "Deploy user HAS sudo" (antes estava inconsistente)

### AGENTS.md  
- ✅ Adicionada regra crítica: "Cron job IDs são UUIDs, sempre listar antes de remove/update"

## Issues Identificados

### Cron Jobs
- ❌ **encartes-diarios** — failing "message thread not found"
- Needs investigation/fix

### Disk Space
- ⚠️ /mnt/ssd still at 86% (257G free) — valid warning

## Conclusion
Sistema bem mantido. Skills atualizadas. Memória teve inconsistências corrigidas. Workflows têm 1 job failing que precisa investigação.