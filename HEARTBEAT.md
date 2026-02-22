# HEARTBEAT.md - Checklist Periódico

## Tarefas (rotacionar entre elas)

### 🖥️ Sistema
- [ ] Checar espaço em disco (`df -h /mnt/ssd`)
- [ ] Verificar se re-encode está rodando (`ps aux | grep ffmpeg`)
- [ ] Checar uso de memória/CPU se algo parecer lento

### 🎬 FieldStation42
- [ ] Verificar se field_player está rodando (`pgrep -f field_player`)
- [ ] Checar logs de erro se necessário

### 🤖 Codex/Background Tasks
- [ ] Checar se há Codex/sub-agents rodando (`process action:list`)
- [ ] Se um Codex morreu (signal 9, timeout): **respawnar imediatamente** com o mesmo task
- [ ] Atualizar kanban (tasks.json) com status atual das tasks

### 🚀 ViralClaw ($10k/month goal) — VPS ONLY, never touch local services
- [ ] Checar VPS health (`curl -s https://api.viral-claw.com/api/v1/health`)
- [ ] Revisar tasks pendentes e próximos moves no roadmap
- [ ] Identificar próxima ação de maior impacto pro crescimento
- [ ] Brainstorm new ideas, channels, partnerships
- [ ] Update strategy doc (`memory/viralclaw-strategy.md`)
- [ ] Open new issues if needed (andrehfp/viralclaw-api)
- [ ] Report findings to André in Telegram topic 1482 (group -1003702782668)

### 🏠 MoldaSpace ($10k/month goal — Full Strategic Ownership)
- [ ] Reddit seeding: comentar em 3-5 posts (conta maia_archviz via Camofox)
- [ ] Checar métricas (PostHog, GSC, Neon DB)
- [ ] Instagram Maia: verificar comments, postar se tiver conteúdo ready
- [ ] Gerar novos renders se arsenal < 5 disponíveis
- [ ] Monitorar threads Reddit com oportunidades de resposta
- [ ] Report no Telegram topic 2265

### 📚 Bboox (Strategic Ownership)
- [ ] Checar estado do repo (issues, PRs, commits recentes)
- [ ] Analisar o que falta pro lançamento
- [ ] Cobrar André no tópico 1386 se algo tá travado
- [ ] Criar issues no GitHub pra qualquer coisa técnica
- [ ] Planejar próximos moves de marketing/growth
- [ ] Pesquisar mercado, concorrentes, oportunidades
- [ ] Preparar materiais (copy, emails, posts, ads)

### 🐦 Twitter/X Monitoring
- [ ] Checar mentions (`x-cli me mentions --max 10`)
- [ ] Search keywords relevantes (`x-cli tweet search "andrehfp OR moldaspace OR viralclaw" --max 10`)
- [ ] Se mention relevante: reportar no Telegram

### 📝 Proatividade
- Se encoding terminou: notificar André com resultados
- Se disco < 10GB livre: alertar (já notificado - ignorar até resolver)
- Se algum serviço caiu: avisar
- Se Codex morreu: respawnar e avisar André

## Horário Ativo
08:00 - 23:00 (São Paulo)

## Notas
- Usar Haiku para economizar tokens
- Não precisa checar tudo a cada heartbeat
- Se nada urgente: HEARTBEAT_OK
