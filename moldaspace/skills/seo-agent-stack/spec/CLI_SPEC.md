# SEO MCP-to-CLI Spec (MoldaSpace)

Objetivo: substituir MCP full por uma camada CLI minimalista e previsível, com saída JSON estável.

## Comandos

## 1) `seo-keywords`

Pesquisa e expansão de palavras-chave (Keywords Everywhere API).

### Uso
```bash
seo-keywords discover \
  --seed "lumion alternative" \
  --lang en \
  --country US \
  --limit 30 \
  --intent auto \
  --json
```

### Flags
- `--seed <text>`: termo inicial (obrigatório)
- `--lang <code>`: `en|pt|...` (default: `en`)
- `--country <code>`: país (default: `US`)
- `--limit <n>`: máximo de sugestões (default: `30`, max `200`)
- `--intent <auto|tofu|mofu|bofu>`: classificador
- `--json`: saída JSON strict
- `--dry-run`: valida input sem chamar API

### Saída (JSON)
```json
{
  "ok": true,
  "action": "seo.keywords.discover",
  "data": {
    "seed": "lumion alternative",
    "lang": "en",
    "country": "US",
    "items": [
      {
        "keyword": "lumion alternative",
        "volume": 2400,
        "cpc": 1.9,
        "competition": 0.67,
        "intent": "bofu",
        "priority": "high"
      }
    ]
  }
}
```

## 2) `seo-serp`

Validação de SERP e dificuldade relativa (DataForSEO API).

### Uso
```bash
seo-serp analyze \
  --keyword "lumion alternative" \
  --lang en \
  --country US \
  --depth 10 \
  --json
```

### Flags
- `--keyword <text>`: termo alvo (obrigatório)
- `--lang <code>`: idioma (default: `en`)
- `--country <code>`: país (default: `US`)
- `--depth <n>`: top resultados (default: `10`, max `100`)
- `--json`: saída JSON strict
- `--dry-run`: valida input sem chamar API

### Saída (JSON)
```json
{
  "ok": true,
  "action": "seo.serp.analyze",
  "data": {
    "keyword": "lumion alternative",
    "difficulty": "medium",
    "serp_intent": "comparison",
    "top_urls": [
      {
        "rank": 1,
        "url": "https://example.com/lumion-alternative",
        "title": "Best Lumion Alternatives"
      }
    ],
    "gaps": [
      "missing before/after visual proof",
      "no pricing comparison"
    ]
  }
}
```

## Contrato de erro

Todos os erros devem seguir:
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR|NETWORK_ERROR|PROVIDER_ERROR",
    "message": "human readable",
    "details": {}
  }
}
```

## Regras de qualidade
- Nunca retornar texto fora do JSON quando `--json` estiver ativo.
- Sempre normalizar intenção para: `tofu|mofu|bofu`.
- Nunca quebrar schema sem versionar (`schema_version`).
