# MoldaSpace Night Research (OpenClaw)

Guia técnico para rodar uma rotina noturna de pesquisa estratégica no estilo “Daily Intelligence Report”.

## Objetivo
Gerar um relatório diário com:
- métricas de negócio
- movimentos de concorrentes
- oportunidades de SEO/distribuição
- insights de comunidade (Reddit/IG)
- plano de ação priorizado para o dia seguinte

---

## 1) Pré-requisitos

- OpenClaw funcionando
- Acesso aos dados/métricas do produto (ou CLI equivalente)
- Canal para receber o relatório (Telegram/Discord/etc.)

Opcional (mas recomendado):
- Um CLI de métricas (ex.: `maia`)
- Scripts para Reddit/social
- Fonte de métricas de tráfego (PostHog/GSC/DB)

---

## 2) Estrutura recomendada no workspace

```text
memory/
  moldaspace-daily/
  active-tasks.md
out/
  MOLDASPACE_NIGHT_RESEARCH_README.md
  MOLDASPACE_NIGHT_RESEARCH.pdf
```

---

## 3) Prompt-base (copiar e colar)

Use este prompt como base para rodar manualmente ou em cron:

```text
Você é um analista de growth do MoldaSpace. Gere um “Daily Intelligence Report” objetivo.

Tarefas:
1) Coletar métricas principais (MRR, receita 24h/7d, signups 24h/7d, ativos 7d).
2) Rodar 4 trilhas de pesquisa em paralelo:
   - Concorrentes (lançamentos, pricing, posicionamento)
   - SEO (queries, gaps, conteúdo, páginas de oportunidade)
   - Comunidade (Reddit/Instagram: dores, perguntas, oportunidades de resposta)
   - Growth (experimentos de aquisição/conversão/retensão)
3) Identificar os 5 principais achados com impacto potencial.
4) Propor plano de ação para amanhã com prioridade (P1/P2/P3), esforço e impacto.
5) Salvar resumo em memory/moldaspace-daily/YYYY-MM-DD.md.

Formato de saída:
- Resumo executivo (5 linhas)
- Métricas
- Top findings
- Riscos
- Plano de ação (3 a 5 ações)
```

---

## 4) Modo A: rodar por Heartbeat (mais simples)

### 4.1 Atualize o `HEARTBEAT.md`
Cole este bloco no heartbeat da instância:

```markdown
## MoldaSpace Night Research (00:30-04:30)
- [ ] Gerar Daily Intelligence Report do MoldaSpace
- [ ] Rodar 4 trilhas: concorrentes, SEO, comunidade, growth
- [ ] Consolidar top 5 achados
- [ ] Propor plano de ação de amanhã (P1/P2/P3)
- [ ] Salvar em memory/moldaspace-daily/YYYY-MM-DD.md
```

### 4.2 Regra de execução
No prompt de heartbeat, inclua regra de janela noturna. Exemplo:
- só executar a rotina entre 00:30 e 04:30
- fora dessa janela, apenas `HEARTBEAT_OK`

---

## 5) Modo B: rodar com Cron (mais previsível)

Crie um job diário para 03:00 (timezone local):

```json
{
  "name": "moldaspace-night-research",
  "schedule": { "kind": "cron", "expr": "0 3 * * *", "tz": "America/Sao_Paulo" },
  "payload": {
    "kind": "agentTurn",
    "message": "[COLE AQUI O PROMPT-BASE DA SEÇÃO 3]"
  },
  "sessionTarget": "isolated",
  "enabled": true
}
```

Sugestão de delivery:
- `announce` para mandar resumo no chat
- webhook se quiser integrar com outro sistema

---

## 6) Formato padrão do relatório

Use este template para manter consistência:

```markdown
# MoldaSpace Daily Intelligence Report - YYYY-MM-DD

## Resumo executivo
- ...

## Métricas
- MRR:
- Receita 24h/7d:
- Signups 24h/7d:
- Ativos 7d:

## Top findings
1. ...
2. ...
3. ...
4. ...
5. ...

## Riscos
- ...

## Plano de ação (amanhã)
- P1: ... (Impacto: Alto | Esforço: Médio)
- P1: ...
- P2: ...
- P3: ...
```

---

## 7) Boas práticas

- Não tentar “fazer tudo”. Priorizar 3-5 ações de maior impacto.
- Evitar texto longo. Relatório bom = claro e acionável.
- Registrar histórico em `memory/moldaspace-daily/` para comparar tendências.
- Sempre separar: **achado** vs **ação recomendada**.

---

## 8) Troubleshooting rápido

- **Sem dados de métrica**: validar credenciais/fonte (DB/PostHog/GSC).
- **Relatório genérico**: apertar prompt para exigir números e evidências.
- **Muito ruído**: reduzir trilhas para 2-3 por alguns dias e reescalar.
- **Sem execução noturna**: checar timezone + schedule do cron + status do gateway.

---

## 9) Resultado esperado

Após 7 dias rodando:
- backlog claro de ações de growth
- visão de tendência (não só foto do dia)
- decisões mais rápidas com menos achismo

Pronto. É copiar, ajustar os nomes das suas fontes e rodar.