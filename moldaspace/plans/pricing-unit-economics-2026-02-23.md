# MoldaSpace — Estudo de custo unitário e nova precificação (2026-02-23)

## Objetivo
Validar a nova proposta de pricing (Creator/Studio/Scale) contra custos reais atuais de geração.

## Fontes usadas
- Neon DB (queries em `generation_costs`, `generation_requests`, `credit_transactions`, `user_subscriptions`) em 2026-02-23.
- Referência histórica interna: `moldaspace/memory/analysis-2026-02-13.md`.

## Baseline de custo por render (real)

### Janela 1 dia
- Renders: 60
- Custo médio por render: **$0.0967**
- Custo total: **$2.90**

### Janela 7 dias (mais representativa do “agora”)
- Renders: 559
- Custo médio por render: **$0.0918**
- Custo total: **$43.60**

### Janela 30 dias
- Renders: 1,817
- Custo médio por render: **$0.1208**
- Custo total: **$203.91**

Leitura: 30d ainda carrega período mais caro com OpenRouter; o custo atual está mais próximo de **$0.09–$0.10**.

## Split por provedor (30d)
- OpenRouter: 1,186 renders, média **$0.1388**, total **$146.76**
- KIE: 631 renders, média **$0.0906**, total **$57.15**

Conclusão: manter KIE como primário é essencial para preservar margem.

## Outros custos variáveis atuais

### Stripe (estimativa 30d)
Distribuição de compras:
- 13 compras de 10 créditos (US$4.70)
- 21 compras de 40 créditos (US$18.80)

Taxa estimada (2.9% + US$0.30):
- Fees compras avulsas: **US$23.42**
- + renovações assinatura (estimada): **US$1.96**
- Total fee estimada: **US$25.38**

### Free/bonus pressure (30d)
- Créditos gerados por purchase + subscription_renewal: **1,070**
- Créditos consumidos em generation: **1,802**

Leitura: parte relevante do consumo vem de trial/bonus/refund. Bom para aquisição, mas precisa controle para não comprimir margem.

## Teste da nova precificação (proposta)
Planos testados:
- Creator: US$19 / 35 renders
- Studio: US$99 / 220 renders
- Scale: US$499 / 1,500 renders

### Cenário base (custo por render = US$0.10)
- Creator
  - Receita/render: US$0.543
  - Stripe: US$0.85
  - COGS geração: US$3.50
  - Lucro bruto após Stripe+geração: **US$14.65 (77.1%)**

- Studio
  - Receita/render: US$0.450
  - Stripe: US$3.17
  - COGS geração: US$22.00
  - Lucro bruto após Stripe+geração: **US$73.83 (74.6%)**

- Scale
  - Receita/render: US$0.333
  - Stripe: US$14.77
  - COGS geração: US$150.00
  - Lucro bruto após Stripe+geração: **US$334.23 (67.0%)**

### Sensibilidade de margem
- Se custo cair para US$0.09: margens ~78.9% / 76.8% / 70.0%
- Se custo subir para US$0.12: margens ~73.4% / 70.1% / 61.0%

## Riscos principais
1. **Fallback excessivo em OpenRouter** eleva custo médio.
2. **Abuso de free/bonus** aumenta custo sem receita proporcional.
3. **Scale** pode comprimir margem se users tiverem uso máximo + alta taxa de fallback.

## Recomendações práticas (curto prazo)
1. Forçar KIE como caminho padrão e monitorar fallback por % diário.
2. Colocar guardrails no free/bonus (rate-limit, antifraude, regras de refund).
3. Rodar experimento de 14 dias da nova pricing com alerta de margem.
4. Dashboard diário com 4 KPIs:
   - Custo médio/render (7d rolling)
   - % renders via OpenRouter
   - Margem bruta por plano (realizada)
   - Créditos grátis consumidos / créditos pagos

## Go / No-Go da nova pricing
- **Go condicional** se:
  - custo médio 7d <= US$0.105
  - fallback OpenRouter <= 20%
  - margem bruta após Stripe+geração >= 65% em todos os planos

- **No-Go (ajustar antes)** se:
  - custo médio 7d > US$0.12 por 5+ dias
  - plano Scale cair abaixo de 60% margem recorrente
