# Análise de Prompts: Users que gastaram 5 créditos sem comprar
*Data: 2026-02-16 | Amostra: 23 users (últimos 14 dias)*

## Perfil dos Churners

### Emails
- 52% Gmail (profissionais reais)
- 22% dollicons.com (emails temporários/descartáveis - 5 users)
- Restante: hotmail, qq.com, domínios próprios (studiolensing.com)

### Comportamento
- Login médio: 0.3 (non-buyers) vs 2.3 (buyers)
- Non-buyers fazem 1 sessão e nunca voltam
- Buyers voltam múltiplas vezes

### Tipo de Prompts
- 36% custom (prompts próprios)
- 20% style_transform (presets: "Transform into Scandinavian/Minimalist/Industrial")
- 16% enhance_preset ("Enhance photorealism...")
- 13% render_preset ("Create a photorealistic render...")
- 15% outros presets (lighting, color, add furniture)

## Classificação dos Users

### 🏗️ PROFISSIONAIS SÉRIOS (40% - ~9 users)
Evidência: projetos reais, uploads de plantas/sketches, iterações específicas
- **Kindergarten architects (Turkey)**: 3 users do mesmo projeto, uploadaram planta PDF, iteraram em plano de piso, fachada, interiores. Prompts em turco. Emails descartáveis = testando a ferramenta pra projeto real.
- **sergio (interiorista)**: email profissional, testou 4 estilos no mesmo espaço
- **yoann (studio)**: email de estúdio, corrigiu espelhos, ajustou teto, fez iterações reais
- **carolina**: iterou 5x no mesmo render tentando melhorar fotorrealismo
- **stavro**: 5 renders rápidos, experimentou todos os estilos

**Por que não compraram:** Provavelmente testando pra decidir se adotam. 5 renders não foi suficiente pra validar qualidade pro workflow deles. OU o preço não justificou vs ferramentas que já usam.

### 🎨 EXPLORADORES CASUAIS (35% - ~8 users)
Evidência: usaram só presets, clicaram em tudo, sem projeto específico
- Testaram "Transform into X" em 4-5 estilos diferentes
- Sem upload próprio (usaram imagem de exemplo?)
- Uma sessão, todos os créditos em <30min
- Email gmail genérico

**Por que não compraram:** Curiosidade satisfeita. Viram o que a ferramenta faz, acharam legal, mas não têm necessidade imediata.

### 🗑️ TIRE KICKERS (25% - ~6 users)
Evidência: emails descartáveis, 1 render só, sessão ultra-curta
- dollicons.com / webxio.pro (disposable email services)
- Fizeram 1-2 renders e sumiram
- Provavelmente criando múltiplas contas pra free trial

**Por que não compraram:** Nunca iam comprar. Possivelmente criando contas novas.

## Insights Chave

1. **40% são profissionais reais que testaram e não converteram.** Esse é o grupo que vale recuperar. Email drip com desconto pode funcionar.

2. **Muitos usam presets, não prompts custom.** Isso sugere que o onboarding empurra pra presets em vez de ensinar o user a usar prompts próprios. Os que usam prompts custom parecem mais engajados.

3. **Turquia é um mercado forte.** 3 users do mesmo projeto (kindergarten). Considerar marketing em turco ou parceria com comunidades de arquitetura turcas.

4. **Login count é o melhor preditor.** Buyers: avg 2.3 logins. Non-buyers: 0.3. Se o user não volta na segunda sessão, provavelmente não vai comprar.

5. **Emails descartáveis = ~25%.** Considerar bloquear dollicons.com, webxio.pro, etc. no signup. Ou exigir verificação de email antes de dar créditos.

## Recomendações

1. **Email na hora certa:** Mandar email 2h após primeira sessão (quando o user saiu mas ainda lembra). "Seus renders ficaram incríveis. Volte e continue."
2. **Bloquear email descartáveis:** Lista de domínios temporários no signup. Economiza 25% dos créditos gratuitos.
3. **Segundo login = trigger de conversão:** Se user volta pela segunda vez, mostrar oferta especial. Esses são os 40% sérios.
4. **Preset users vs Custom users:** Trackear isso. Custom = mais likely to convert.
