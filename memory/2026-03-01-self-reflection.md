# Auto-reflexão diária — 2026-03-01 22:00

## 1) Skills
- `skills/MANIFEST.md` continua consistente com as skills em `skills/*/SKILL.md`.
- Gap ainda aberto: existem bundles legados duplicados (`skills/dist/startup-moat.skill` e `skills/viral-reels.skill`) coexistindo com versões em pasta. Não removi sem confirmação para evitar quebrar algum fluxo que ainda leia `.skill`.
- Recomendação prática: definir padrão único (pasta + `SKILL.md`) e mover bundles legados para `skills/archive/`.

## 2) Memória
- `memory/2026-03-01.md` estava faltando. Criado hoje para manter continuidade.
- `MEMORY.md` atualizado com blocker operacional recorrente: `cron announce delivery failed` intermitente em jobs semanais.

## 3) SOUL.md
- Continua alinhado com estilo atual (direto, crítico, sem corporativês). Sem mudanças hoje.

## 4) TOOLS.md
- Continua atual para o estado operacional atual (warnings de config e comandos de cron corretos). Sem mudança textual hoje.

## 5) Workflows
- Reaplicado `--best-effort-deliver` em ambos os crons semanais com falha recente de announce:
  - `99aa7758-bfd8-429c-8dc2-70db06a699e8` (Weekly Review)
  - `e78c3268-24d5-406c-be58-b106d3f5dbe7` (André Action Items)
- Prompt do `André Action Items` está correto para evitar itens stale (já filtrando done/paused/archived).

## 6) AGENTS.md
- Regras seguem coerentes e úteis. Sem ajustes hoje.
