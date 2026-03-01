# Auto-reflexão - 2026-02-28

## 1) Skills

### O que estava desatualizado
- `skills/social-media-poster/SKILL.md` dizia que LinkedIn estava descontinuado.
- `skills/youtube-thumbs/SKILL.md` não deixava explícito que a skill está pausada por decisão do André.

### Correções aplicadas
- Social poster: alinhado com operação atual (LinkedIn ativo via scripts dedicados, fora dessa skill).
- YouTube thumbs: aviso de status PAUSADO no topo.

### Gap percebido
- Existem `.skill` zipados legados (`skills/dist/startup-moat.skill`, `skills/viral-reels.skill`) duplicando conteúdo já presente em `skills/*/SKILL.md`.
- Recomendação: consolidar em formato único (preferir pasta + `SKILL.md`) e arquivar/remover artefatos zipados após confirmação.

## 2) Memória

### Estado
- `MEMORY.md` está majoritariamente alinhado com foco atual (MoldaSpace #1, Bboox fora de foco, ViralClaw banho-maria).
- Faltava arquivo diário de hoje.

### Ações
- Criado `memory/2026-02-28.md` com log da manutenção.

### Pendência de higiene
- Revisar `memory/active-tasks.md` na segunda para limpar itens antigos com status implícito já resolvido.

## 3) SOUL.md
- Continua coerente com o comportamento esperado (direto, pragmático, sem firula).
- Sem mudança hoje.

## 4) TOOLS.md
- Bloco de cron/debug atualizado para refletir warnings reais atuais e comportamento observado do doctor.

## 5) Workflows

### Situação observada
- Quase todos os crons em `ok`.
- Dois semanais já tiveram `cron announce delivery failed` na última execução.

### Mitigação aplicada
- Reaplicado `--best-effort-deliver` nos dois IDs semanais críticos.

### Risco residual
- Warning de config (`channels.whatsapp.enabled unknown`) persiste mesmo após doctor. Parece ruído de validação, não falha funcional.

## 6) AGENTS.md
- Regras seguem fazendo sentido e estão úteis para evitar escalar erro cedo demais.
- Sem mudança hoje.
