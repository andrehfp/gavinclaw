# MoldaSpace Sprint — Semana 16-22/Fev 2026

## Meta da Semana
Implementar subscription + maiores alavancas de conversão.

## Status Atual (atualizado 16/fev 15:36)
- **MRR:** $333 | **Buyers:** 31/781 (3.8%) | **Repeat:** 10 (32%)
- **Issues fechadas hoje:** 12 (!) — #83 pricing + #109 data quality + 9 security + #106 updated
- **Instagram Maia:** 4 posts/dia rodando (Sonnet 4.5)
- **Reddit:** seeding ativo, karma building

## Fechadas Hoje ✅ (16 issues!)
| # | Issue | Tipo |
|---|-------|------|
| #83 | Subscription Monthly $19/mo + drop Pro pack | pricing ✅ |
| #105 | Fix credit wall tracking | bug ✅ |
| #106 | Intervenção render #3 (banner implementado) | growth ✅ |
| #108 | Trial 5→3 (coberto pelo banner) | growth ✅ |
| #109 | Backfill 714 missing signup_dates | data quality ✅ |
| #110 | Full-screen paywall at 0 credits | growth ✅ |
| #111 | Multi-projeto (correlação ≠ causa) | growth ✅ |
| #94-#104 | 9 security issues | security ✅ |

## Próximas Prioridades (5 abertas)
| Prioridade | Issue | Esforço | Quando |
|------------|-------|---------|--------|
| 🔴 1 | #107 — Email drip zero-credit users (remarketing) | 2-3h | Terça 17/fev |
| 🔴 2 | #93 — Referral system (invite = 5 credits) | 3-4h | Quarta 18/fev |
| 🟡 3 | #100 — SEO programmatic pages (style × room) | 1 dia | Quinta 19/fev |
| 🟡 4 | #99 — Blog posts SEO | ongoing | Sexta 20/fev |
| 🟢 5 | #113 — Remove unsafe-inline CSP (nonce-based) | 1-2h | Quando der |

## Novo Track (aprovado) — SEO Agent Stack (MCP-to-CLI)

**Objetivo:** executar SEO orientado a aquisição com qualidade alta, sem MCP full.

### Entregas já prontas
- `moldaspace/skills/seo-agent-stack/spec/CLI_SPEC.md`
- `moldaspace/skills/seo-agent-stack/bin/seo-keywords` (implementado)
- `moldaspace/skills/seo-agent-stack/bin/seo-serp` (implementado)
- `--dry-run` funcional nos dois comandos

### Fase 1 (assim que assinar APIs)
1. Conectar credenciais (Keywords Everywhere + DataForSEO)
2. Rodar baseline de 20 keywords EN/PT
3. Priorizar 8 páginas BOFU
4. Publicar 2 páginas e medir CTR/signup por URL

### Regras de operação
- Máximo 2-3 páginas novas por semana
- Sem publicação sem prova visual + CTA de 5 free renders
- Review semanal de canibalização + refresh de páginas com alto impression/baixo CTR

## Paralelo — Gavin (autônomo)
- [x] Instagram Maia: 4 posts/dia com Sonnet 4.5 ✅
- [x] Fix instagram_post.py: auto-upload via Catbox ✅
- [x] Issue #111 criada (multi-projeto) ✅
- [x] Sprint plan criado ✅
- [ ] Reddit seeding: 3-5 comments/dia
- [ ] SEO keyword research (concorrentes)
- [ ] Competitor pricing analysis
- [ ] Monitorar métricas diárias

## Checkpoints Diários
- **06:00** — Morning briefing: métricas + sprint status + foco do dia
- **18:00** — Evening review: o que rolou + o que travou

## Pricing Aprovado (Feb 16)
| Plan | Credits | Price | $/credit | Type |
|------|---------|-------|----------|------|
| Starter | 10 | $6 | $0.60 | One-time |
| Standard | 40 | $19 | $0.475 | One-time |
| Monthly | 50/mo | $19/mo | $0.38 | Subscription |

## Target
- Curto prazo (30d): $700+ MRR via #105 + #111 + subscription
- Médio prazo (90d): $2k+ MRR via SEO + content + referrals
- Longo prazo (6mo): $10k/month
