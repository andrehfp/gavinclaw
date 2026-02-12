# ViralClaw - Estrutura de Custos

## Custo por Short (estimativa)

### Groq (Whisper + LLM)
- Whisper transcrição: ~$0.001/min de vídeo
- LLama 70B análise: ~$0.001 por request (1.5k tokens in, 300 out)
- **Total Groq: ~$0.003 por vídeo de 5min**

### R2 Storage
- Upload/armazenamento: $0.015/GB/mês
- Operações: $0.36/milhão requests
- Short médio ~20MB → $0.0003/mês por short
- **Total R2: ~$0.001 por short (negligível)**

### Video Processing (o grosso do custo)

#### Opção A: VPS atual (Hostinger)
- $20-40/mês fixo
- 2 CPUs, ~5-10min por short de 60s
- ~200-300 shorts/dia (sequencial)
- **Custo por short: ~$0.005-0.007** (amortizado)
- ⚠️ Não escala, fila cresce

#### Opção B: Modal (serverless GPU)
- $30/mês grátis no plano Starter
- CPU: $0.142/core/hora (~$0.00004/core/seg)
- GPU T4: ~$0.60/hora
- Para video encoding (CPU-only com ffmpeg):
  - 4 cores x 5 min = ~$0.047 por short
  - Com GPU NVENC: ~$0.01-0.02 por short (10x mais rápido)
- **Custo por short: ~$0.02-0.05 (CPU) ou ~$0.01-0.02 (GPU)**
- ✅ Escala automático, zero fila

#### Opção C: Hetzner Dedicated (GPU)
- Servidor com GPU: ~$50-80/mês
- NVENC encoding: ~30s por short
- ~2000-3000 shorts/dia
- **Custo por short: ~$0.001-0.002** (amortizado)
- ✅ Melhor custo/benefício com volume

#### Opção D: Cloud Run / Lambda
- CPU-only, similar ao Modal sem GPU
- ~$0.03-0.05 por short
- Boa escalabilidade

### Stripe
- 2.9% + $0.30 por transação
- No pack de $29: $1.14 de taxa → $27.86 líquido

---

## Cenários de Margem

### Pack: $29 = 200 créditos (1 crédito = 1 min de vídeo processado)
- Média ~3 shorts por vídeo de 5min = ~66 shorts por pack

| Item | Custo/short | Total (66 shorts) |
|------|-----------|-------------------|
| Groq | $0.003 | $0.20 |
| R2 | $0.001 | $0.07 |
| Processing (VPS) | $0.006 | $0.40 |
| Processing (Modal CPU) | $0.04 | $2.64 |
| Processing (Modal GPU) | $0.015 | $0.99 |
| Processing (Hetzner GPU) | $0.002 | $0.13 |
| Stripe fee | - | $1.14 |

### Margem por cenário:
- **VPS**: $29 - $1.81 = **$27.19 (93.7%)** ← não escala
- **Modal GPU**: $29 - $2.40 = **$26.60 (91.7%)** ← escala!
- **Modal CPU**: $29 - $4.05 = **$24.95 (86.0%)** 
- **Hetzner GPU**: $29 - $1.54 = **$27.46 (94.7%)** ← melhor margem com volume

---

## Recomendação

### Fase 1 (agora - 50 clientes): VPS
- Custo fixo baixo, margem alta
- Fila aceitável com poucos usuários

### Fase 2 (50-500 clientes): Modal serverless
- Migra workers pra Modal
- Escala automático, paga por uso
- API/DB continua na VPS

### Fase 3 (500+ clientes): Hetzner dedicado + Modal overflow
- Servidor dedicado com GPU pro volume base
- Modal pra picos de demanda
- Melhor custo/benefício

---

*Atualizado: 2026-02-08*
