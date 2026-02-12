# ViralClaw → $10k/mês — Plano Estratégico

**Owner:** Gavin (AI) | **Sponsor:** André Prado
**Criado:** 2026-02-10 | **Meta:** $10k MRR em 5 meses
**Status:** PLANNING

---

## Situação Atual

- **Produto:** API funcional com 6 formatos (shorts, carousels, threads, quote cards, audiograms, repurpose)
- **Stack:** FastAPI + PostgreSQL + Redis + Workers + R2 CDN + Stripe
- **Infra:** Servidor local (mediarr) + VPS Hostinger (deploy user sem sudo)
- **Landing page:** viral-claw.com | API: api.viral-claw.com
- **Pricing atual:** $29/200 créditos, 3 free no signup
- **Clientes pagantes:** 0
- **MRR:** $0
- **GitHub:** github.com/andrehfp/viralclaw-api (private)
- **Skill OpenClaw:** github.com/viralclaw/openclaw-skill

### Formatos disponíveis
1. **Shorts** — clipa momentos virais de vídeos longos
2. **Carousels** — gera slides visuais pra Instagram/LinkedIn
3. **Threads** — transforma conteúdo em threads pra Twitter/X
4. **Quote Cards** — imagens com citações do vídeo
5. **Audiograms** — clips de áudio com waveform visual
6. **Repurpose** — all-in-one (todos os formatos de uma vez)

### Blockers técnicos
- [ ] Processamento paralelo de vídeos (hoje: 1 worker, sequencial)
- [ ] Qualidade de output precisa de refinamento
- [ ] VPS worker precisa de restart manual (deploy user sem sudo)

---

## Estratégia Core

**Positioning:** "One Video. Every Format. Zero editing."
**ICP primário:** YouTube creators e podcasters que querem repurpose automatizado
**ICP secundário:** Agências de social media (10-50 clientes)
**ICP terciário:** AI agents e automações (OpenClaw, n8n, Make)

**Moat:** API-first (nenhum concorrente faz 6 formatos numa API), pricing acessível, qualidade de copy em PT e EN via LLM

---

## Pricing Revisado

| Plano | Mensal | Anual | Créditos | Target |
|-------|--------|-------|----------|--------|
| Starter | $29/mês | $199/ano | 200/mês | Solo creators |
| Pro | $79/mês | $549/ano | 600/mês | Creators sérios |
| Agency | $199/mês | $1.399/ano | 2000/mês | Agências |
| Scale | $499/mês | $3.499/ano | 6000/mês | Agências grandes |

**Meta de mix pra $10k:**
- 40 Starter ($1.160) + 30 Pro ($2.370) + 20 Agency ($3.980) + 5 Scale ($2.495) = ~$10k

---

## Fases

### FASE 0: Fundação (Semanas 1-2) ← ATUAL
**Objetivo:** Produto pronto pra primeiros usuários externos

- [ ] Resolver processamento paralelo (Modal.com ou scale workers local)
- [ ] Testar todos os 6 formatos end-to-end com vídeos variados
- [ ] Revisar qualidade de output (shorts principalmente)
- [ ] Implementar tiers de pricing no Stripe
- [ ] Criar onboarding flow: signup → 3 créditos free → primeiro job → resultado
- [ ] Documentação da API (já tem llms.txt, melhorar)
- [ ] Landing page revisada com demos reais dos 6 formatos

### FASE 1: Primeiros 20 Clientes (Semanas 3-6)
**Objetivo:** $800 MRR, feedback real, product-market fit signal

**Canal 1 — YouTube Evergreen (André grava, Gavin prepara roteiro)**
5 vídeos essenciais:
1. "How I turn 1 YouTube video into 6 content formats with AI"
2. "I built an AI tool that creates YouTube Shorts automatically"
3. "OpusClip alternative: 6 formats from 1 video (full demo)"
4. "Automate your content repurposing with one API call"
5. "From podcast to carousel, thread, shorts — all automated"

Cada vídeo:
- Roteiro preparado pelo Gavin
- Demo real do ViralClaw
- Link na descrição com trial grátis
- CTA claro

**Canal 2 — Reddit (Gavin executa)**
- Monitorar r/SaaS, r/content_marketing, r/youtubers, r/podcasting
- Responder threads relevantes com valor genuíno
- DMs pra pessoas reclamando de video editing manual
- Meta: 10 DMs/dia em threads relevantes

**Canal 3 — Product Hunt Prep**
- Preparar assets: tagline, screenshots, demo video, maker comment
- Recrutar 5-10 early users pra upvote no launch day
- Agendar launch pra semana 5

**Métricas Fase 1:**
- 50+ signups (free trial)
- 20+ jobs processados por externos
- 20 clientes pagantes
- NPS de primeiros usuários
- Feedback qualitativo sobre output

### FASE 2: Product Hunt + Partnerships (Semanas 7-10)
**Objetivo:** $2.500 MRR

**Canal 4 — Product Hunt Launch**
- Launch day: tudo preparado na Fase 1
- Maker comment com story real
- Engajamento o dia inteiro
- Follow-up com todos que comentaram
- Meta: Top 5 do dia

**Canal 5 — Partnerships (Gavin identifica, André fecha)**
3 partnerships target:
1. **Dono de comunidade de YouTube creators** (Skool/Facebook)
   - Oferta: 30% recurring + conta gratuita
2. **Influencer de AI tools / produtividade**
   - Oferta: demo exclusiva + 30% recurring
3. **Agência de social media média** (10-30 clientes)
   - Oferta: Agency plan free por 3 meses em troca de case study

**Canal 6 — Listings**
- BetaList (pago pra skip queue ~$99)
- SaaSHub
- AlternativeTo (como alternativa a OpusClip, Repurpose.io)
- There's An AI For That
- Indie Hackers (product listing + build log)

**Métricas Fase 2:**
- 200+ signups total
- 50 clientes pagantes
- 2+ partnerships ativas
- $2.500 MRR

### FASE 3: Escala (Semanas 11-16)
**Objetivo:** $5-7k MRR

**Canal 7 — Afiliados (Rewardful)**
- Setup Rewardful com 30% recurring
- Convidar todos os early users satisfeitos
- Criar página de afiliados no site
- Kit de assets pra afiliados (banners, copy, demos)

**Canal 8 — Conteúdo composto**
- YouTube: 2 vídeos/semana (Gavin escreve roteiro)
- Twitter/X: 3-5 posts/dia sobre building ViralClaw
- LinkedIn: 2 posts/semana (via content-brainstorm skill)
- Blog/SEO: artigos comparativos (ViralClaw vs X)

**Canal 9 — Agency outreach personalizado**
- Identificar 50 agências de social media no Brasil e US
- Approach personalizado (não cold email genérico)
- Oferta: "processe 100 vídeos de clientes de graça, sem compromisso"
- Meta: converter 10 agências no plano Agency

**Métricas Fase 3:**
- 100+ clientes pagantes
- 10+ afiliados ativos
- 5+ agências no plano Agency
- $5-7k MRR

### FASE 4: $10k (Semanas 17-20)
**Objetivo:** $10k MRR sustentável

- Word of mouth compondo
- YouTube evergreen gerando trials automaticamente
- Afiliados trazendo clientes sem esforço
- Upsells naturais: Starter → Pro → Agency
- Features pedidas por clientes (ex: scheduling, auto-post)
- Considerar: newsletter sponsorship em 1-2 newsletters de creators

---

## Responsabilidades

### Gavin (AI) — Ownership total de:
- Estratégia e plano (este documento)
- Roteiros de YouTube
- Copy do site, emails, Product Hunt
- Content brainstorm (LinkedIn, Twitter, Reddit)
- Pesquisa de mercado e concorrentes
- Monitoramento Reddit + identificação de leads
- Identificação de partnerships potenciais
- Preparação de materials de afiliados
- Tracking de métricas e ajuste de strategy
- Code reviews e sugestões técnicas

### André — Ajuda em:
- Gravar vídeos YouTube
- Fechar partnerships (calls, demos)
- Decisões de pricing e produto
- Infra (resolver Modal.com, servidor, scaling)
- Aprovar copy e materiais antes de publicar
- Resolver blockers técnicos

---

## Tracking

| Semana | MRR | Clientes | Signups | Canal Principal |
|--------|-----|----------|---------|-----------------|
| 1-2 | $0 | 0 | 0 | Fundação técnica |
| 3-4 | $0 | 0 | 10 | YouTube + Reddit |
| 5-6 | $800 | 20 | 50 | Product Hunt prep |
| 7-8 | $1.500 | 35 | 120 | Product Hunt launch |
| 9-10 | $2.500 | 50 | 200 | Partnerships |
| 11-12 | $4.000 | 70 | 300 | Afiliados + conteúdo |
| 13-14 | $6.000 | 100 | 400 | Agency outreach |
| 15-16 | $7.500 | 130 | 500 | Compounding |
| 17-20 | $10.000 | 170 | 700 | Sustentável |

---

## Decisões Tomadas (Gavin)
1. **Modal.com → NÃO por agora.** Systemd template resolve. Reavaliar com 50+ clientes.
2. **Vídeos em INGLÊS.** Mercado global, pricing USD, competitors em EN.
3. **Dashboard web SIM (mínimo).** Upload → formatos → resultados → download. API-only afasta 80%.
4. **BetaList $99 → SIM.** Newsletter sponsorships só na Fase 3.
5. **YouTube com clones de voz do André.** Gavin escreve roteiro + gera vídeo, André aprova antes de publicar.

---

*Documento vivo. Atualizado pelo Gavin a cada milestone.*
