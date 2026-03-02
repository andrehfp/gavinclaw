# Estimativa de custos (Railway + OpenAI)

Data: 2026-02-28

## Escopo
Estimativa baseada no app atual:
- Phoenix + LiveView + Oban no mesmo serviço
- PostgreSQL obrigatório
- Fluxo de LLM com router + modelo primário + follow-up após tool

## Premissas usadas
- Volume base: **500 mensagens de usuário/dia** (~15.000/mês)
- Infra Railway:
  - 1 serviço app Elixir
  - 1 PostgreSQL
  - Faixa estimada: **US$ 40–80/mês**
- Preços OpenAI via models.dev (USD por 1M tokens):
  - `gpt-5.2`: input **1.75**, output **14**
  - `gpt-5`: input **1.25**, output **10**
  - `gpt-5-mini`: input **0.25**, output **2**
  - `gpt-4.1`: input **2**, output **8**
  - `gpt-4.1-mini`: input **0.4**, output **1.6**
  - `gpt-4o`: input **2.5**, output **10**
  - `gpt-4o-mini`: input **0.15**, output **0.6**

## Cenário atual (defaults do app)
Config padrão:
- router: `gpt-5-mini`
- primary: `gpt-5.2`

Estimativa mensal:
- OpenAI: **~US$ 280/mês**
- Railway: **US$ 40–80/mês**
- Total: **~US$ 320–360/mês**

Faixa conservadora (variação de uso/tokens):
- OpenAI: **US$ 180–620/mês**
- Total com Railway: **US$ 220–700/mês**

## Comparação de modelos (mesmo volume/padrão)
OpenAI por mês (estimado):

- router `gpt-5-mini` + primary `gpt-5.2`: **~US$ 280**
- router `gpt-5-mini` + primary `gpt-5`: **~US$ 205**
- router `gpt-5-mini` + primary `gpt-4.1`: **~US$ 260**
- router `gpt-5-mini` + primary `gpt-4o`: **~US$ 325**
- router `gpt-5-mini` + primary `gpt-4.1-mini`: **~US$ 63**
- router `gpt-5-mini` + primary `gpt-4o-mini`: **~US$ 32**

## Leitura rápida
- O maior custo tende a ser **OpenAI**, não Railway.
- Trocar apenas o router quase não muda custo (já é barato).
- O principal impacto vem do **modelo primário** e de tokens de output no follow-up.
- Para custo mínimo, `gpt-4.1-mini`/`gpt-4o-mini` reduzem bastante, com potencial trade-off de qualidade.

## Observações
- Os valores acima são estimativas iniciais.
- O app já possui estrutura para medir uso/custo real via `llm_response_usages` (`Cazu.LLM.ResponseUsage`).
- Recomenda-se revisar após alguns dias de tráfego real para calibrar o forecast.
