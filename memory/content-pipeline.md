# Content Pipeline: YouTube → Everything

## Telegram Thread
- Group: -1003702782668
- Thread: 1691 (Content Engine / LinkedIn)

## Fluxo
1. André grava YouTube long-form
2. Pipeline detecta vídeo novo (cron 2h)
3. ViralClaw gera shorts + transcrição (endpoint novo)
4. Gavin pega transcrição → gera posts:
   - LinkedIn (PT-BR, storytelling, Hormozi style)
   - Twitter/X (EN, provocação curta)
   - Descrições otimizadas pros shorts
5. Manda pra André aprovar via Telegram
6. Aprovado → posta automaticamente

## Status
- [x] YouTube detection (cron pipeline)
- [x] ViralClaw shorts generation
- [x] LinkedIn posting script
- [ ] Twitter/X posting (blocked: read-only permissions)
- [ ] ViralClaw transcription endpoint (André building)
- [ ] Content generation from transcript (Gavin)
- [ ] Approval flow via Telegram (inline buttons)
- [ ] Auto-post on approval

## Referências
- Hormozi framework: "How I" > "How To", CTAs em tudo, adaptar por plataforma
- Justin Welsh (linkedin-os skill): hooks, content matrix
- LinkedIn: PT-BR | Twitter: EN

## André's Content Pillars
- AI-first solo dev (4 SaaS em 60 dias)
- Build in public com resultados reais
- Indie hacker lifestyle (pai de 2, empreendedor)
- Hot takes sobre AI vs devs tradicionais

## Preferências de Design (aprovadas)
- Quote cards: usar sempre o modelo estilo "print do X" com:
  - fundo preto
  - avatar do André + nome/@handle
  - texto grande ocupando boa parte da arte (estilo Justin Welsh)
  - sem métricas inventadas (likes/views/etc.)
- Texto "gerado com infomygraphic.com": usar somente em infográficos. Não usar em quote/image/carrossel comum.
