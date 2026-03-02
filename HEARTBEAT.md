# HEARTBEAT.md - Checklist Periódico

## Tarefas (rotacionar entre elas)

### 🧠 Context Logging (AFS-lite)
- [ ] Início do heartbeat: `gctx begin heartbeat "Heartbeat HH:MM"`
- [ ] Durante checks importantes: `gctx event <phase> "nota"`
- [ ] Final do heartbeat: `gctx end ok 0.9 "resumo"` (ou `partial/fail`)

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

### 🚀 ViralClaw (banho-maria)
- [ ] Só checar health 1x por dia (`curl -s https://api.viral-claw.com/health -H 'X-API-Key: <key>'`)
- [ ] Não abrir frente nova sem sinal explícito do André
- [ ] Se cair serviço/erro crítico, avisar no Telegram topic 1482

### 🏠 MoldaSpace ($10k/month goal - Full Strategic Ownership)
- [ ] Reddit seeding: comentar em 3-5 posts (conta maia_archviz via Camofox)
- [ ] Checar métricas (PostHog, GSC, Neon DB)
- [ ] Instagram Maia: verificar comments, postar se tiver conteúdo ready
- [ ] Gerar novos renders se arsenal < 5 disponíveis
- [ ] Monitorar threads Reddit com oportunidades de resposta
- [ ] Report no Telegram topic 2265

### 📚 Bboox
- [ ] Pausado por decisão do André (não gastar ciclos até novo sinal)

### 🐦 Twitter/X Monitoring
- [ ] **PAUSADO por decisão do André (2026-03-01)** — não checar mentions/search até novo sinal

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
