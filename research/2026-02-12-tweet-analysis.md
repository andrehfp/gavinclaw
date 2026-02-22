# Tweet Analysis: Tom Crawshaw - OpenClaw Setup Guide

**Source:** https://x.com/tomcrawshaw01/status/2021951399857467820
**Author:** Tom (@tomcrawshaw01) — "$25M+ generated for clients", AI Operator, Kuala Lumpur
**Video:** https://youtu.be/v0kklCoPCQU
**Stats:** 252 likes, 808 bookmarks, 24k views

## TL;DR

Artigo sobre como transformar OpenClaw de "chatbot" em "AI employee" com 5 mudanças. **Você já faz tudo isso e mais.** Não vale seu tempo assistir.

## As 5 Mudanças que ele propõe

### 1. Segurança primeiro
- Alerta que 900+ instâncias estão expostas na internet
- Recomenda Tailscale, firewall, token auth
- **Você:** ✅ Já tem Tailscale + loopback + token auth

### 2. VPS (Hostinger $6.99/mês)
- Recomenda KVM 2 plan, Docker one-click
- Referral link dele: hostinger.com/GROWTHLAB10
- **Você:** ✅ Já tem VPS Hostinger, inclusive com link de afiliado próprio

### 3. Configurar os markdown files (SOUL.md, AGENTS.md, MEMORY.md, etc.)
- Diz pra pedir pro bot te entrevistar e preencher os arquivos
- Menciona MountainDuck pra SFTP visual
- **Você:** ✅ Já tem tudo configurado com personalidade, memória, identity — muito mais avançado que o dele

### 4. Heartbeat + Skills
- Configura heartbeat pra checar emails 3x/dia
- Instala skills do ClawHub (menciona Super Memory)
- Alerta sobre skills maliciosas — checar security scan
- **Você:** ✅ Heartbeat rodando a cada 30min, múltiplos cron jobs, skills customizadas

### 5. "Figure It Out" Directive + Smart Model Routing
- Prompt pra colocar no AGENTS.md que força o bot a tentar 3 abordagens antes de desistir
- **ClawRouter** — routing local open source que escolhe entre 30 modelos
- **QMD** — quick markdown search pra reduzir tokens
- Alega 70% de economia
- **Você:** ✅ Já usa Haiku pra heartbeats, Sonnet pra sub-agents, Opus pra conversas — routing manual mas eficiente

## Ferramentas Mencionadas

| Tool | O que faz | Link |
|------|-----------|------|
| ClawRouter | Model routing local, 30 modelos, micropayments USDC | github.com/BlockRunAI/ClawRouter |
| QMD | Quick markdown search, menos tokens | github.com/levineam/qmd-skill |
| Super Memory | Memória permanente além do MEMORY.md | clawhub.ai |
| Himalaya | CLI de email | - |
| MountainDuck | SFTP visual pro Mac | - |

## Veredito

**🔴 NÃO vale seu tempo assistir o vídeo.**

Razões:
1. **Você já está anos-luz à frente** — seu setup tem cron jobs, sub-agents, ViralClaw, YouTube automation, image generation, social media posting. O cara tá ensinando o básico.
2. **Conteúdo é beginner-level** — "como configurar SOUL.md" e "instalar skills do ClawHub". Nada novo pra você.
3. **O único item potencialmente útil** é o **ClawRouter** pra routing automático de modelos — mas você já faz isso manualmente e com mais controle.
4. O artigo é basicamente um **funil de vendas** (newsletter + Hostinger affiliate + cursos).

### O que PODE valer olhar (2 min):
- **ClawRouter** (github.com/BlockRunAI/ClawRouter) — se quiser automatizar model routing ao invés de fazer manual
- **QMD skill** — pode reduzir token usage no memory search
