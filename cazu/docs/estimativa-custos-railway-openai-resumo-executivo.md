# Resumo executivo — custos mensais (Railway + OpenAI)

Data: 2026-02-28

## Base de cálculo
- Arquitetura atual: 1 app Phoenix/Oban + 1 PostgreSQL no Railway
- Config padrão de modelos: router `gpt-5-mini`, primary `gpt-5.2`
- Valores de referência de preço por token via models.dev

## Cenários (mensal)

### 1) Baixo uso
- Volume: ~100 mensagens/dia
- OpenAI: **US$ 35–125**
- Railway: **US$ 30–50**
- **Total: US$ 65–175/mês**

### 2) Médio uso (referência)
- Volume: ~500 mensagens/dia
- OpenAI: **US$ 180–620**
- Railway: **US$ 40–80**
- **Total: US$ 220–700/mês**
- Ponto médio prático: **~US$ 320–360/mês**

### 3) Alto uso
- Volume: ~2000 mensagens/dia
- OpenAI: **US$ 720–2480**
- Railway: **US$ 80–180**
- **Total: US$ 800–2660/mês**

## Conclusão objetiva
- O custo dominante tende a ser **OpenAI**.
- Railway normalmente representa a menor parte da conta no cenário atual.
- Para reduzir custo total, o maior impacto está em:
  1. trocar o **modelo primário** (não o router), e/ou
  2. reduzir tokens por turno (histórico, prompts, follow-up).

## Próximo passo recomendado
Após 7–14 dias de produção, consolidar custo real em `llm_response_usages` e recalibrar orçamento com dados observados.
