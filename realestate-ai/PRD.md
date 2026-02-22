# PRD — PropContent AI
*Plataforma de automação de conteúdo e anúncios para corretores de imóveis*

**Status:** Conceito / Pré-MVP  
**Data:** 2026-02-19  
**Owner:** André Prado

---

## 1. Problema

Corretores de imóveis sabem que precisam de presença digital consistente — vídeos, carrosséis, anúncios — mas não têm tempo nem habilidade para produzir esse conteúdo. Gastam R$300–2.500/mês em Meta Ads com ROI invisível porque os criativos são ruins. As ferramentas existentes (Canva + ChatGPT manual, Curaytor, PropertySimple) não geram vídeo/Reels e são todas focadas no mercado americano.

**Dor #1:** Não produzem conteúdo consistente  
**Dor #2:** Anúncios no Meta convertem mal por criativos fracos  
**Dor #3:** Sobrecarregados — fazem tudo sozinhos

---

## 2. Solução

Corretor sobe fotos + dados do imóvel (ou conecta ao ZAP/OLX). Em 2 minutos recebe:

- 🎬 **Reel pronto** para Instagram/TikTok (via ViralClaw)
- 🖼️ **Carrossel** com detalhes do imóvel (via Nano Banana Pro)
- 📢 **Copy de anúncio** para Meta Ads (título, descrição, CTA) (via OpenRouter)
- 📸 **Post estático** para feed (via KIE.ai)

Tudo em um clique. Tudo no padrão visual do corretor (logo, cores, contato).

---

## 3. Usuário-alvo

**Primário:** Corretor autônomo brasileiro (CRECI ativo)
- 450k no Brasil
- Gasta R$300–800/mês em Meta Ads
- Usa WhatsApp + Instagram como principais canais
- Não tem equipe de marketing

**Secundário:** Imobiliárias pequenas (5–20 corretores)
- Gasta R$2k–5k/mês em Meta Ads
- Precisa de padronização de marca entre corretores

**Internacional (v2):** Real estate agents nos EUA, Portugal, Espanha

---

## 4. MVP — Funcionalidades

### Core (v1)
- [ ] Upload de fotos do imóvel (até 10 fotos)
- [ ] Formulário de dados: tipo, área, preço, localização, destaques
- [ ] Geração de Reel (15–30s, narração AI, música de fundo)
- [ ] Geração de carrossel (5–8 slides, branding do corretor)
- [ ] Geração de copy para anúncio Meta (headline + texto + CTA)
- [ ] Download de todos os assets em ZIP
- [ ] Onboarding de marca (logo, cor, nome, contato do corretor)
- [ ] Dashboard com histórico de imóveis e assets gerados
- [ ] Sistema de créditos (1 imóvel = 1 pacote de assets)

### Fora do MVP (v2)
- Publicação direta no Instagram/Facebook (Meta API)
- Integração ZAP/Viva Real via XML feed
- Relatórios de performance dos anúncios
- Personalização de templates
- Multi-usuário (imobiliárias)
- Tour virtual 360°

---

## 5. Stack Técnica

```
Frontend:     Next.js 15 (App Router) + Tailwind
Auth:         Clerk
DB:           Neon (PostgreSQL) + Drizzle ORM
Pagamentos:   Stripe (créditos pré-pagos + plano mensal)
Jobs async:   BullMQ + Redis (Upstash) — para geração de vídeo/imagem
Storage:      Cloudflare R2

AI Services (já existentes):
- Reels:      ViralClaw API (interno)
- Carrosséis: KIE.ai Nano Banana Pro
- Copy:       OpenRouter (GPT-4o ou Claude)
- Imagens:    KIE.ai GPT Image 1

Deploy:
- Frontend:   Vercel
- Workers:    Railway (BullMQ workers)
```

### Por que NÃO Elixir agora
Elixir é excelente para sistemas concorrentes em produção. Mas:
1. André nunca usou → curva de aprendizado = semanas perdidas
2. Next.js + BullMQ resolve a mesma concorrência para escala de validação
3. Se atingir $10k MRR com escala real, migrar workers para Elixir faz sentido

---

## 6. Arquitetura (MVP)

```
User
 └── Next.js App
      ├── Upload fotos → R2
      ├── Form dados imóvel → Neon
      └── Trigger job → BullMQ Queue
                         └── Worker
                              ├── ViralClaw API → Reel MP4 → R2
                              ├── KIE.ai API → Carrossel PNGs → R2
                              └── OpenRouter → Copy texto → Neon
                         └── Notify via SSE → Frontend atualiza
 └── Download ZIP (Reel + Carrossel + Copy.txt)
```

---

## 7. Pricing

### Brasil
| Plano | Preço | Créditos | Descrição |
|-------|-------|----------|-----------|
| Starter | R$97/mês | 8 imóveis/mês | Corretor autônomo |
| Pro | R$197/mês | 20 imóveis/mês | Corretor ativo |
| Imobiliária | R$497/mês | 60 imóveis/mês | Equipe até 5 corretores |
| Avulso | R$29/imóvel | Pay-per-use | Sem assinatura |

### Internacional (v2)
| Plano | Preço | Créditos |
|-------|-------|----------|
| Starter | $29/mês | 8 properties |
| Pro | $59/mês | 20 properties |
| Agency | $149/mês | 60 properties |

**Margem estimada por imóvel:**
- Reel (ViralClaw): ~$0.50
- Carrossel (KIE.ai): ~$0.20
- Copy (OpenRouter): ~$0.05
- **Total custo:** ~$0.75/imóvel (~R$3.75)
- **Receita Starter:** R$97/8 = R$12.12/imóvel → **margem ~69%**

---

## 8. Go-to-Market

### Fase 1 — Validação local (semanas 1–2)
- 5 corretores em Ponta Grossa/PR para demo com imóvel real
- Meta: 2 de 5 dispostos a pagar → validado
- Canais: abordagem direta (André conhece o mercado)

### Fase 2 — Tração BR (semanas 3–8)
- Reddit: r/corretores, grupos Facebook de corretores
- YouTube: vídeo mostrando o antes/depois (imóvel → Reel em 2 min)
- CRECI regional como parceiro de distribuição
- Afiliados: corretores influenciadores no Instagram

### Fase 3 — Internacional (após $5k MRR)
- ProductHunt launch
- r/realtors (1.75k membros ativos)
- AppSumo para LTD inicial

---

## 9. Timeline MVP

| Semana | Entregável |
|--------|-----------|
| 1 | Setup Next.js + Clerk + Neon + R2 + Stripe |
| 1–2 | Upload de fotos + form de dados + onboarding de marca |
| 2–3 | Integração ViralClaw (Reel generation) + BullMQ |
| 3 | Integração KIE.ai (carrossel) |
| 3–4 | Integração OpenRouter (copy Meta Ads) |
| 4 | Dashboard + histórico + download ZIP |
| 4–5 | Polish UI + testes com corretores reais |
| 5 | Lançamento beta fechado (10 corretores) |

**Estimativa:** MVP funcional em 4–5 semanas.

---

## 10. Riscos

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Meta Ads API burocrática | Alta | MVP sem publicação automática — só gera assets |
| Corretores BR resistentes a pagar | Média | Validar presencialmente antes de build |
| Qualidade do Reel insuficiente | Média | Testar com ViralClaw primeiro, manual fallback |
| ViralClaw instável | Baixa | André controla o produto — prioriza estabilidade |
| Concorrente lança antes | Baixa | Gap é real mas não há player dominante |

---

## 11. Métricas de Sucesso

- **Semana 2:** 5 demos → 2+ dispostos a pagar
- **Mês 1:** 10 corretores pagantes
- **Mês 3:** R$5k MRR
- **Mês 6:** R$20k MRR (Brasil) → expansão internacional

---

## Notas

- **LeadCasa (tentativa anterior):** falhou por ser intermediário (newsletter). Este produto cria assets diretos — dor tangível, valor imediato.
- **Dogfooding:** ViralClaw é usado internamente. Bug encontrado = bug corrigido na mesma semana.
- **Nome provisório:** PropContent AI. Outros: ListAI, ReelImobi, PropReel, ImovAI.
