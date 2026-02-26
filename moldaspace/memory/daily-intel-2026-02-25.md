🔬 **MoldaSpace Daily Intel** — 2026-02-25
📊 Métricas: MRR **$455.90** | Usuários ativos: **91 (7d)** | Leads por indicação: **0 (24h) / 0 (ontem) / 3 (7d)**

🏆 **Top Finding**
O gargalo principal parece ser **ativação/conversão, não aquisição bruta**. O PostHog mostra concentração extrema de tráfego em URLs de signup/consentimento (incluindo parâmetros longos e duplicados), enquanto as conversões de receita ficaram fracas ontem (US$0) apesar de haver signups. Em paralelo, Reddit confirma dor recorrente de mercado: ferramentas atuais são vistas como “rápidas porém com qualidade inconsistente”, com fluxo técnico frágil e difícil para não-especialistas.

📣 **Reddit Pain Points (Track A — últimos 7 dias)**
- **Hardware/VRAM gargalo (r/archviz):** viewport lag/freezes e dúvida recorrente sobre 8GB vs 12/16GB para cenas maiores.  
  https://www.reddit.com/r/archviz/comments/1rcivwu/help_me_choose_gpu_for_archviz_3060_12gb_vs_4060/
- **AI com utilidade prática (r/archviz):** comunidade pede integração real no dia a dia, não só “hype/demo”.  
  https://www.reddit.com/r/archviz/comments/1rbc5ge/how_has_ai_actually_integrated_into_your_archviz/
- **Qualidade “game-like” (r/archviz):** queixa direta de render escuro/artificial em Lumion/D5 para certos estilos.  
  https://www.reddit.com/r/archviz/comments/1rb64km/which_software_can_be_used_to_create_renderings/
- **Workflow fragmentado (r/archviz):** dor com handoff não destrutivo Archicad/SketchUp/Lumion/Blender.  
  https://www.reddit.com/r/archviz/comments/1rb3zrr/house_on_a_mountain_scene/
- **Pressão de revisões (r/archviz):** clientes exigindo ciclos cada vez mais rápidos.  
  https://www.reddit.com/r/archviz/comments/1rc38wy/how_is_everyone_handling_endless_client_revisions/
- **Ansiedade de mercado (r/archviz + r/architecture):** medo de commoditização por IA, mas com abertura para ferramentas que preservem controle profissional.  
  https://www.reddit.com/r/archviz/comments/1rcnimz/arch_viz_in_trouble_because_of_ai/  
  https://www.reddit.com/r/architecture/comments/1rc72gt/ai_in_architecture/

🎯 **Quick Wins (fazer essa semana)**
1. **Landing “Lumion/Twinmotion/D5 alternative” (EN + PT-BR)** com comparação direta de dor real (tempo vs qualidade vs simplicidade), CTA de trial e prova visual before/after.
2. **Ataque ao gargalo de signup**: revisar fluxo `/sign-up/consent` (reduzir passos, limpar redirects com parâmetros redundantes, medir taxa por etapa com evento dedicado).
3. **Página SEO de alta intenção**: “AI render for SketchUp” + “software de render para interiores” com exemplos reais, benchmark de tempo e download de preset/prompt pack.
4. **Conteúdo “Rescue my render”**: série curta (Reels/YouTube Shorts) mostrando como corrigir resultado “escuro/game-like/pixelado” em minutos.
5. **Programa de parcerias educacionais BR (piloto)** com 2 faculdades (FAU-USP e Mackenzie): licença acadêmica + desafio mensal de visualização.

📉 **Competitor Intel**
**Sinais de produto/mercado (últimos ciclos visíveis):**
- **Twinmotion**: página de release notes ativa com trilha 2025.2/2025.1/2024.1 (cadência contínua de updates).  
  Fonte: https://dev.epicgames.com/documentation/en-us/twinmotion/release-notes-for-twinmotion
- **Midjourney**: foco recente em **V8 Rating Party** (várias rodadas em sequência, 14–20 fev), reforçando iteração rápida de modelo.  
  Fonte: https://updates.midjourney.com/
- **Veras (EvolveLAB/Chaos)**: posicionamento forte em ecossistema AEC (SketchUp/Revit/Rhino/Vectorworks/Web) + pricing explícito (**$59/m named**, **$612/ano floating**, **$149/ano estudante**).  
  Fonte: https://www.evolvelab.io/veras

**Atualização Track B (competidores, 30d):**
- **Lumion**: movimento de packaging para **View / Pro / Studio** e narrativa de fluxo integrado com Cloud + AI upscaler (beta). Oportunidade para MoldaSpace: atacar migração com benchmark objetivo de tempo/qualidade/custo.  
  Fontes: https://lumion.com/product/buy | https://lumion.com/product/lumion-view | https://lumion.com/product/lumion-pro
- **Enscape (Chaos)**: sinais claros de evolução de licenciamento com **Cloud Licensing** chegando (reduzir fricção administrativa), além de cadence ativa de releases 4.15/4.16 preview.  
  Fontes: https://forum.enscape3d.com/wcf/index.php?board/19-news-faq/ | https://forum.enscape3d.com/index.php?thread/30975-cloud-licensing-is-coming-to-enscape/
- **D5 Render**: pricing agressivo e foco em equipe (**Pro $30/m, Teams $59/seat/m anual**) com forte volume de suporte no fórum — sinal de adoção, mas também de atrito operacional.  
  Fontes: https://www.d5render.com/pricing | https://forum.d5render.com/categories.json
- **Twinmotion**: release 2025.2 robusto, porém com queixas recorrentes de estabilidade/performance em uso real.  
  Fonte: https://dev.epicgames.com/documentation/en-us/twinmotion/twinmotion-2025-2-release-notes
- **Midjourney / Firefly**: muito fortes para ideação, ainda com ruído para workflow determinístico de produção arquitetônica (consistência/controle).  
  Fontes: https://updates.midjourney.com/ | https://www.adobe.com/products/firefly.html

**Frustrações de usuários (sinal competitivo acionável):**
- **Instabilidade de fluxo** (ex.: crash ao sincronizar Rhino↔Twinmotion).  
  https://old.reddit.com/r/Twinmotion/comments/1rdd6px/crash_0x00000000ffdfc3dd_keeps_happening_when/
- **Qualidade inconsistente/pixelada mesmo elevando custo de render** (amostras altas sem ganho claro).  
  https://old.reddit.com/r/Twinmotion/comments/1rcvlep/topico_de_ajuda_problemas_com_a_qualidade_de/
- **Complexidade de ferramentas para iniciantes e usuários Mac** (resistência em adotar fluxo tradicional).  
  https://old.reddit.com/r/Sketchup/comments/1qwhv6b/any_good_free_rendering_programs_for_mac/
- **D5/Twinmotion/Lumion vistos como rápidos, mas com limite de qualidade estética** em certos estilos; reclamação sobre biblioteca gratuita restrita (D5).  
  https://www.reddit.com/gallery/1rbxcx5
- **Resultado “escuro com cara de videogame”** em Lumion/D5 versus referência desejada mais suave.  
  https://old.reddit.com/r/archviz/comments/1rb64km/which_software_can_be_used_to_create_renderings/

**Gap estratégico para MoldaSpace:**
- Ganhar no discurso de **“qualidade profissional sem pipeline técnico quebradiço”**.
- Posicionar produto como **ponte entre velocidade de IA e controle de resultado final**, especialmente para SketchUp/interiores.

📝 **Ideias de Conteúdo**
1. **“Lumion vs D5 vs Twinmotion vs IA (MoldaSpace): o que entrega visual premium mais rápido?”** (post comparativo com 1 cena padrão).
2. **“Por que seu render fica escuro e com cara de game (e como corrigir em 3 ajustes)”** (carrossel + vídeo curto).
3. **“AI render for SketchUp: workflow real em 10 minutos”** (tutorial objetivo com arquivo de exemplo).
4. **Thread Reddit (r/archviz):** “fast but not best quality — testes lado a lado com prompts e configurações”.
5. **Conteúdo PT-BR:** “Melhor software de renderização para arquitetura em 2026 (sem placa high-end?)”.

🤝 **Creator Collabs (YouTube) — prioridade**
1. **Arch Viz Artist** — episódio patrocinado de benchmark (pipeline tradicional vs AI-assisted no mesmo briefing).
2. **Show It Better** — sprint “concept-to-presentation” integrando MoldaSpace no workflow arquitetônico real.
3. **Ross Plemya** — série tutorial “client-ready AI archviz sem perder intenção de projeto”.

🔍 **Keywords pra atacar**
1. **rendering software for interior design** (intenção: comparação/comercial) — já há impressões sem clique no GSC.
2. **3d rendering software for interior design** (intenção: lista/comparativo) — oportunidade clara de CTR.
3. **ai render for sketchup** (intenção: solução específica de workflow).
4. **lumion alternative 2026** (intenção de troca, fundo de funil).
5. **melhor software renderização arquitetura** (PT-BR, intenção comparativa local).

📈 **Growth & Partnerships (Track D) — Top 10 priorizados**
1. **Sponsorship bundle em YouTube (ecossistema SketchUp/Archviz)** — esforço: médio | impacto: alto.  
   Próximo passo: mídia kit + outreach para 15 criadores com cupom e afiliado.
2. **Parcerias de conteúdo workflow (mid-size creators)** — esforço: médio | impacto: alto.  
   Próximo passo: formato co-branded “modelo → render final em X min” com UTM.
3. **Collabs Instagram Brasil (microinfluencers de arquitetura/interiores)** — esforço: baixo-médio | impacto: alto.  
   Próximo passo: 10 testes com criativos before/after e incentivo por CPA.
4. **Ativação em Discords de arquitetura** — esforço: baixo | impacto: médio-alto.  
   Próximo passo: challenge mensal patrocinado com créditos de prêmio.
5. **Playbook Facebook Groups (arquitetura/SketchUp/interiores)** — esforço: baixo | impacto: médio.  
   Próximo passo: calendário semanal de conteúdo utilitário (sem hard-sell).
6. **Programa Embaixadores em faculdades BR** — esforço: médio | impacto: alto.  
   Próximo passo: piloto em 3 escolas com licença educacional + workshop.
7. **Webinars com CAU/regionais e entidades setoriais** — esforço: alto | impacto: alto.  
   Próximo passo: proposta de webinar CPD “IA na visualização arquitetônica”.
8. **Sprint de diretórios (G2/Capterra/GetApp/alternatives)** — esforço: baixo | impacto: médio-alto.  
   Próximo passo: publicar perfis em 7 dias + semear primeiras 15 reviews verificadas.
9. **Product Hunt launch/relaunch** — esforço: médio | impacto: médio.  
   Próximo passo: kit de lançamento + lista de apoiadores para o dia D.
10. **Integrações/ecossistemas (SketchUp/Revit/AutoCAD)** — esforço: alto | impacto: alto.  
   Próximo passo: conector leve (export/import + one-click send) + submissão em marketplaces.

🚀 **Big Idea**
Lançar o **“MoldaSpace Rescue Week”**: campanha de aquisição em que arquitetos enviam renders “problemáticos” (escuros, serrilhados, sem realismo) e recebem versão corrigida + mini-breakdown em 24h. Isso gera prova social massiva, conteúdo UGC, leads qualificados e posiciona MoldaSpace exatamente no ponto de dor que os usuários estão verbalizando nos fóruns.

---
**Notas de inteligência / anomalias de hoje**
- Receita ontem: **US$0** (com signups ocorrendo), sugerindo fricção de ativação/monetização.
- Forte concentração de tráfego em páginas de signup/consentimento e URLs com parâmetros extensos → possível vazamento de eficiência no funil.
- Leads de indicação em ritmo baixo no curtíssimo prazo (**0 em 24h e ontem**), apesar de **3 em 7 dias**.

**Fontes consultadas (amostra principal):**
- Métricas internas: `maia analytics --json`
- Twinmotion release hub: https://dev.epicgames.com/documentation/en-us/twinmotion/release-notes-for-twinmotion
- Midjourney updates: https://updates.midjourney.com/
- Veras product/pricing: https://www.evolvelab.io/veras
- Reddit pain signals (archviz/SketchUp/Twinmotion): links listados nas seções acima
- Brasil/ecossistema institucional: https://caubr.gov.br/ | https://www.asbea.org.br/ | https://www.fau.usp.br/ | https://www.mackenzie.br/graduacao/sao-paulo-higienopolis/arquitetura-e-urbanismo | https://apps.autodesk.com/en | https://extensions.sketchup.com/
