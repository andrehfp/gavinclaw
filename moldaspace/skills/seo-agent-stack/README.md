# MoldaSpace SEO Agent Stack (OpenClaw)

Skills baseadas no post do EXM7777, adaptadas para MoldaSpace com foco em aquisição real (sem spam).

## Skills incluídas

1. `programmatic-seo/`  
   Gera e mantém páginas transacionais (EN + PT-BR) com template de alta intenção.

2. `keywords-everywhere-mcp/`  
   Pesquisa keyword intelligence (volume, CPC, related) via MCP.

3. `dataforseo-mcp/`  
   SERP tracking, concorrência, auditoria on-page e sinais de backlinks via MCP.

## Como usar (fluxo recomendado)

1. Rodar `bin/seo-keywords discover ... --json` para descobrir clusters.
2. Validar prioridade com `bin/seo-serp analyze ... --json`.
3. Gerar/atualizar páginas com `programmatic-seo`.
4. Medir em GSC + signup conversion e iterar semanalmente.

### Teste rápido

```bash
cd ~/.openclaw/workspace/moldaspace/skills/seo-agent-stack

# Dry-run
./bin/seo-keywords discover --seed "lumion alternative" --lang en --country US --limit 10 --intent auto --json --dry-run
./bin/seo-serp analyze --keyword "lumion alternative" --lang en --country US --depth 10 --json --dry-run
```

## Regras anti-slop

- Nunca publicar página sem intenção clara (TOFU/MOFU/BOFU).
- Nunca publicar sem prova visual (before/after, casos reais, outputs).
- Priorizar BOFU (`alternative`, `vs`, `for <tool>`) antes de volume.
- Máximo 2-3 páginas novas por semana no início.

## Estrutura

- `programmatic-seo/SKILL.md`
- `keywords-everywhere-mcp/SKILL.md`
- `dataforseo-mcp/SKILL.md`
- `IMPLEMENTATION_CHECKLIST.md`

