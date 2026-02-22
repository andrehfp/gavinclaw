# PRD: Maia — AI Design Assistant for MoldaSpace

**Author:** Gavin (AI) + André Prado
**Date:** 2026-02-17
**Status:** Draft
**GitHub Issue:** #125

---

## 1. O Problema

O MoldaSpace gera renders, mas o usuário tá sozinho nas decisões de design. Ele não sabe se o layout faz sentido, se as cores combinam, se a iluminação tá boa. Hoje ele gasta créditos "no escuro", sem feedback.

Resultado: usuários geram 1-2 renders, não ficam satisfeitos, e abandonam. A taxa de conversão trial→paid é 7.2%, e o repeat rate é 32%. Tem espaço pra crescer muito se o usuário tiver mais confiança no que tá criando.

## 2. A Solução

**Maia** é uma assistente de design integrada ao MoldaSpace que:
- Analisa o projeto do usuário e dá feedback de design
- Sugere melhorias antes e depois do render
- Guia o onboarding com perguntas sobre estilo
- Incentiva uso de créditos de forma orgânica (não pushy)

A Maia já existe no Reddit (u/maia_archviz) dando conselhos de archviz e interior design com tom natural e técnico. Essa persona já tá validada com upvotes e replies positivas. Agora é trazer ela pra dentro do produto.

## 3. Personas

| Persona | Necessidade | Como Maia Ajuda |
|---------|-------------|-----------------|
| Designer iniciante | Não tem segurança nas escolhas | Maia valida ou sugere alternativas |
| Arquiteto apressado | Quer resultado rápido sem tentativa/erro | Maia sugere ajustes certeiros |
| Estudante | Aprendendo, quer entender por quê | Maia explica princípios de design |
| Real estate | Quer render bonito pra vender imóvel | Maia sugere staging que vende |

## 4. Experiência do Usuário

### 4.1 Chat Lateral no Canvas (MVP)

Quando o usuário tá editando um projeto, aparece um ícone da Maia no canto inferior direito (estilo Intercom/Crisp). Ao clicar, abre um chat lateral.

**Fluxo:**
1. Usuário abre projeto
2. Ícone da Maia aparece com uma mensagem proativa contextual:
   - Projeto novo: "Oi! Que tipo de ambiente você tá criando? Posso te ajudar com o estilo."
   - Projeto com render: "Ficou bom! Quer que eu analise e sugira melhorias?"
   - Projeto parado há dias: "Vi que você não mexeu nesse projeto. Quer retomar? Posso sugerir um caminho."
3. Usuário conversa naturalmente
4. Maia tem acesso ao contexto do projeto (tipo de ambiente, estilo, renders já gerados)

**Interações principais:**
- "Que estilo combina com esse ambiente?"
- "O layout tá bom?"
- "Que cores usar pra uma sala moderna?"
- "Analisa esse render pra mim"
- "Como faço pra parecer mais realista?"

### 4.2 Review Pós-Render

Depois que um render é gerado, a Maia automaticamente oferece uma análise:

> "Render ficou bonito! Algumas sugestões:
> - A iluminação tá meio flat. Tenta adicionar um ponto de luz quente no canto esquerdo.
> - O sofá tá muito centralizado, um layout assimétrico ficaria mais natural.
> - As texturas da madeira tão uniformes demais. Variar os tons daria mais realismo.
> Quer gerar uma nova versão com essas mudanças?"

Esse CTA é o upsell natural: cada sugestão é um motivo pra gastar mais 1 crédito.

### 4.3 Onboarding Conversacional

Em vez do onboarding atual (formulário ou tour), a Maia guia o primeiro projeto:

1. "Oi! Sou a Maia, sua assistente de design. O que você quer criar hoje?"
2. "Qual estilo? Moderno, escandinavo, industrial, clássico...?"
3. "Que tipo de ambiente? Sala, quarto, cozinha, banheiro...?"
4. "Vai! Faz um sketch ou upload de uma planta e eu te ajudo a transformar."

Reduz abandono no onboarding e coleta preferências de forma natural.

### 4.4 Sugestões Proativas (Fase 2)

Baseado no comportamento do usuário:
- Usuário só gera renders de salas → "Já experimentou fazer uma cozinha? Seu estilo moderno ficaria incrível."
- Usuário gerou 3 renders sem comprar → "Tá gostando dos resultados? O pack de 10 créditos sai mais em conta."
- Usuário não volta há 3 dias → Email com sugestão da Maia baseada no último projeto.

## 5. Arquitetura Técnica

### 5.1 Stack

```
Frontend (Next.js)
├── ChatWidget component (React)
│   ├── Floating button (canto inferior direito)
│   ├── Chat panel (slide-in lateral)
│   ├── Render analysis overlay
│   └── Canvas state capture (node selecionado, viewport)
│
├── API Route: /api/maia/chat
│   ├── Recebe: mensagem + canvas state + projectId
│   ├── Context Builder: monta as 4 camadas de contexto
│   ├── Chama: Anthropic API (Sonnet 4.6, streaming)
│   └── Salva: mensagem + resposta em maia_conversations
│
├── API Route: /api/maia/analyze
│   ├── Recebe: render image URL + project metadata
│   ├── Chama: Anthropic API (Sonnet 4.6 com vision)
│   └── Retorna: análise + sugestões
│
└── Background Job: /api/maia/summarize (Haiku 4.5)
    ├── Triggered: a cada 10 mensagens ou troca de projeto
    ├── Gera: resumo do histórico longo + perfil de preferências
    └── Salva: maia_user_summaries
```

### 5.2 As 4 Camadas de Contexto

A Maia recebe contexto em 4 camadas, montadas pelo Context Builder no backend a cada mensagem.

#### Camada 1: Perfil do Usuário (do banco, barato)

Dados do `user_credits` + `user_preferences` + agregações.

```json
{
  "user": {
    "first_name": "Pablo",
    "signup_date": "2026-02-10",
    "login_count": 12,
    "credits_remaining": 2,
    "total_projects": 5,
    "total_renders": 18,
    "total_credits_purchased": 40,
    "is_paying": true,
    "preferred_styles": ["scandinavian", "modern"],
    "preferred_rooms": ["living_room", "bedroom"],
    "last_credit_wall_at": "2026-02-16T14:30:00Z"
  }
}
```

`preferred_styles` e `preferred_rooms` são inferidos automaticamente dos prompts históricos do usuário via query:

```sql
-- Extrair estilos mais usados dos prompts
SELECT prompt FROM canvas_nodes
WHERE project_id IN (SELECT id FROM projects WHERE user_id = ?)
AND prompt IS NOT NULL
ORDER BY created_at DESC LIMIT 20;
```

O backend parseia os prompts com regex simples (ou Haiku, se quiser mais precisão) pra extrair estilos e tipos de ambiente mencionados.

#### Camada 2: Projeto Atual (do banco, uma query)

Dados do projeto que o usuário tá editando agora. Inclui a árvore de evolução completa.

```json
{
  "project": {
    "name": "Sala do Apartamento 302",
    "created_at": "2026-02-15",
    "total_nodes": 7,
    "uploads": 2,
    "renders": 5,
    "render_tree": [
      {
        "id": "node-1",
        "type": "upload",
        "image_url": "https://r2.moldaspace.com/projects/.../original.png"
      },
      {
        "id": "node-2",
        "type": "render",
        "parent": "node-1",
        "prompt": "Add appropriate furniture to this interior space. Choose furniture that fits the style and scale of the room.",
        "image_url": "https://r2.moldaspace.com/projects/.../render1.png"
      },
      {
        "id": "node-3",
        "type": "render",
        "parent": "node-2",
        "prompt": "Transform this space into a Scandinavian style. Light woods, white walls, minimal decor, cozy textiles.",
        "image_url": "https://r2.moldaspace.com/projects/.../render2.png"
      }
    ],
    "styles_tried": ["default", "scandinavian"],
    "last_render_prompt": "Transform this space into a Scandinavian style..."
  }
}
```

Query pra montar a árvore:

```sql
-- Todos os nodes do projeto com relações
SELECT n.id, n.prompt, n.image_key, n.parent_id, n.created_at,
       e.source_node_id as edge_source
FROM canvas_nodes n
LEFT JOIN canvas_edges e ON e.target_node_id = n.id
WHERE n.project_id = ?
ORDER BY n.created_at ASC;
```

#### Camada 3: Estado Atual do Canvas (do frontend, enviado na request)

O frontend captura e envia junto com cada mensagem. Isso é o que o usuário tá olhando AGORA.

```json
{
  "canvas_state": {
    "selected_node_id": "node-3",
    "selected_node_type": "render",
    "selected_node_prompt": "Transform this space into a Scandinavian style...",
    "viewport_zoom": 1.2,
    "visible_node_ids": ["node-1", "node-2", "node-3"]
  }
}
```

O ChatWidget component captura isso do estado do canvas React (React Flow, Konva, ou custom) e manda na request.

#### Camada 4: Contexto Visual (imagens via Vision API)

A mais poderosa. A Maia "vê" o que o usuário tá vendo.

**Quando enviar imagens:**
- Usuário pede análise de render → envia o render selecionado
- Usuário pergunta sobre layout → envia o render atual
- Primeiro render do projeto → envia automaticamente (análise proativa)
- Usuário compara estilos → envia os dois renders

**Quando NÃO enviar (economia de tokens):**
- Perguntas genéricas sobre design ("que cor combina com cinza?")
- Perguntas sobre créditos/conta
- Conversa casual

**Lógica de decisão (no backend):**

```javascript
function shouldIncludeImage(message, canvasState) {
  const imageKeywords = ['analisa', 'analyze', 'olha', 'look', 'render',
    'imagem', 'image', 'melhorar', 'improve', 'o que acha', 'what do you think'];
  const hasKeyword = imageKeywords.some(k => message.toLowerCase().includes(k));
  const isNewRender = canvasState.selected_node_type === 'render';

  return hasKeyword || (isNewRender && canvasState.just_generated);
}
```

Quando inclui imagem, manda via vision:

```javascript
const messages = [
  ...conversationHistory,
  {
    role: "user",
    content: [
      {
        type: "image",
        source: { type: "url", url: selectedNodeImageUrl }
      },
      { type: "text", text: userMessage }
    ]
  }
];
```

### 5.3 Memória Conversacional (2 níveis)

A Maia precisa lembrar o que já conversou com o usuário. Sem isso, cada mensagem é uma conversa nova.

#### Nível 1: Conversa Recente (últimas 20 mensagens)

Vai direto como `messages[]` na API do Anthropic. Custo baixo (~2-4K tokens extras).

```javascript
// Carregar histórico recente do projeto
const recentMessages = await db.query(`
  SELECT role, content, created_at FROM maia_conversations
  WHERE user_id = $1 AND project_id = $2
  ORDER BY created_at DESC LIMIT 20
`, [userId, projectId]);

// Montar array de messages pra API
const messages = [
  ...recentMessages.reverse().map(m => ({
    role: m.role,
    content: m.content
  })),
  { role: "user", content: currentMessage }
];
```

#### Nível 2: Resumo de Longo Prazo (cross-project)

Quando o usuário tem 50+ mensagens ou muda de projeto, o Haiku gera um resumo compacto.

```json
{
  "user_summary": {
    "design_preferences": "Prefere estilos escandinavos e modernos. Prioriza iluminação quente (2700K). Não gosta de layouts simétricos. Valoriza texturas naturais de madeira.",
    "skill_level": "Intermediário. Entende conceitos de composição mas pede ajuda com teoria de cores.",
    "interaction_style": "Direto, faz perguntas específicas. Responde bem a sugestões com justificativa técnica.",
    "past_projects": "3 salas de estar (2 escandinavas, 1 moderna), 1 quarto minimalista, 1 cozinha industrial.",
    "common_issues": "Tende a sobrecarregar espaços com mobília. Já foi orientada sobre espaço negativo 2x."
  }
}
```

Esse resumo é gerado por um background job (Haiku 4.5, ~$0.006 por resumo) e salvo em:

```sql
CREATE TABLE maia_user_summaries (
  user_id TEXT PRIMARY KEY,
  summary JSONB NOT NULL,
  messages_summarized INTEGER DEFAULT 0,
  last_updated_at TIMESTAMP DEFAULT NOW()
);
```

**Trigger pra atualizar:** a cada 10 novas mensagens, ou quando o usuário abre um projeto diferente.

### 5.4 O System Prompt Completo (montado dinamicamente)

Tudo junto, o system prompt que a Maia recebe fica assim:

```
Você é Maia, assistente de design da MoldaSpace.

## Seu tom
- Amigável mas técnica (não condescendente)
- Direta e prática (não enrola)
- Dá conselhos acionáveis (não genéricos)
- Usa termos de design mas explica quando necessário
- Encoraja experimentação ("testa isso, vê se curte")
- Responde no idioma que o usuário usar

## Suas habilidades
- Interior design e archviz
- Teoria de cores, iluminação, composição
- Layout e circulação de ambientes
- Staging para real estate
- Análise de renders (quando imagem fornecida)

## Regras
- NUNCA seja pushy sobre comprar créditos
- Sugira melhorias que naturalmente levam a novos renders
- Se o usuário perguntar algo fora de design, redirecione gentilmente
- Referencie o projeto atual e decisões anteriores do usuário
- Máximo 150 palavras por resposta (seja concisa)
- Quando analisar um render, dê no máximo 3 sugestões práticas
- Se o usuário já tentou algo (veja os prompts), não sugira de novo

## Contexto do Usuário
Nome: Pablo
Nível: Intermediário (12 logins, 18 renders)
Créditos: 2 restantes
Estilos preferidos: escandinavo, moderno
Tipos de ambiente: salas, quartos
Observações: Prefere iluminação quente. Não gosta de simetria.
             Tende a sobrecarregar espaços. Já orientada sobre espaço negativo.

## Projeto Atual: "Sala do Apartamento 302"
Criado: 15/02/2026
Uploads: 2 (sketch original + foto referência)
Renders: 5 (evolução: upload → mobiliado → escandinavo → iluminação quente → ...)
Estilos tentados: default, escandinavo
Último prompt: "Transform this space into a Scandinavian style. Light woods, 
               white walls, minimal decor, cozy textiles."

## Estado Atual
Usuário olhando: Render #3 (escandinavo, gerado há 2h)
Zoom: 1.2x

## Histórico desta conversa: ver messages[]
```

### 5.5 Context Builder (a função que junta tudo)

```javascript
// /lib/maia/context-builder.ts

export async function buildMaiaContext(
  userId: string,
  projectId: string,
  canvasState: CanvasState
): Promise<MaiaContext> {

  // Camada 1: Perfil do usuário
  const userProfile = await getUserProfile(userId);
  const userSummary = await getUserSummary(userId); // do maia_user_summaries

  // Camada 2: Projeto atual
  const project = await getProjectWithTree(projectId);
  const projectPrompts = project.nodes
    .filter(n => n.prompt)
    .map(n => n.prompt);
  const stylesTried = extractStyles(projectPrompts);

  // Camada 3: Canvas state (já vem do frontend)
  const selectedNode = project.nodes.find(n => n.id === canvasState.selected_node_id);

  // Camada 4: Imagem (URL do node selecionado, se aplicável)
  const imageUrl = selectedNode?.image_key
    ? `${R2_PUBLIC_URL}/${selectedNode.image_key}`
    : null;

  // Histórico recente (Nível 1)
  const recentMessages = await getRecentMessages(userId, projectId, 20);

  // Montar system prompt
  const systemPrompt = buildSystemPrompt({
    userProfile,
    userSummary,
    project,
    stylesTried,
    selectedNode,
    canvasState
  });

  return { systemPrompt, recentMessages, imageUrl };
}
```

### 5.6 Schema do Banco (completo)

```sql
-- Mensagens de conversa (por projeto)
CREATE TABLE maia_conversations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  has_image BOOLEAN DEFAULT FALSE,
  image_node_id TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  model TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_maia_conv_user_project ON maia_conversations(user_id, project_id, created_at DESC);

-- Resumo de longo prazo (por usuário, cross-project)
CREATE TABLE maia_user_summaries (
  user_id TEXT PRIMARY KEY,
  summary JSONB NOT NULL,
  preferred_styles TEXT[], -- cache pra query rápida
  preferred_rooms TEXT[],  -- cache pra query rápida
  skill_level TEXT,        -- 'beginner', 'intermediate', 'advanced'
  messages_summarized INTEGER DEFAULT 0,
  last_project_id TEXT,
  last_updated_at TIMESTAMP DEFAULT NOW()
);

-- Rate limiting
CREATE TABLE maia_rate_limits (
  user_id TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
```

### 5.7 Fluxo Completo (request → response)

```
1. Usuário digita "como melhorar esse render?" no ChatWidget
2. Frontend captura canvas state (node selecionado, zoom, etc.)
3. POST /api/maia/chat {
     message: "como melhorar esse render?",
     projectId: "abc-123",
     canvasState: { selected_node_id: "node-3", ... }
   }
4. Backend: rate limit check
5. Backend: buildMaiaContext(userId, projectId, canvasState)
   → Query user profile (Camada 1)
   → Query project tree (Camada 2)
   → Recebe canvas state (Camada 3)
   → Resolve image URL do node selecionado (Camada 4)
   → Carrega últimas 20 mensagens
   → Carrega user summary (se existir)
   → Monta system prompt
6. Backend → Anthropic API (streaming):
   {
     model: "claude-sonnet-4-6",
     system: systemPrompt,
     messages: [...recentMessages, {
       role: "user",
       content: [
         { type: "image", source: { type: "url", url: imageUrl } },
         { type: "text", text: "como melhorar esse render?" }
       ]
     }],
     max_tokens: 500,
     stream: true
   }
7. Stream response → Frontend (tokens aparecem em tempo real)
8. Salva mensagem do usuário + resposta em maia_conversations
9. Se messages_count % 10 === 0 → trigger background summary job
```

## 6. Custos

### 6.1 Por Interação

| Tipo | Modelo | Input (est.) | Output (est.) | Custo |
|------|--------|-------------|--------------|-------|
| Chat simples | Sonnet 4.6 | ~800 tokens | ~200 tokens | ~$0.005 |
| Chat com contexto | Sonnet 4.6 | ~2,000 tokens | ~300 tokens | ~$0.011 |
| Análise de render (vision) | Sonnet 4.6 | ~1,500 tokens + imagem | ~400 tokens | ~$0.015 |
| Resumo de histórico | Haiku 4.5 | ~3,000 tokens | ~500 tokens | ~$0.006 |

### 6.2 Projeção Mensal

| Cenário | Usuários ativos | Msgs/usuário/mês | Custo total |
|---------|----------------|-------------------|-------------|
| Atual (142 ativos) | 50 usando Maia | 10 msgs | ~$2.75 |
| Growth (400 ativos) | 150 usando Maia | 15 msgs | ~$12.40 |
| Scale (1000 ativos) | 400 usando Maia | 20 msgs | ~$44.00 |

**Custo é irrelevante.** Mesmo no cenário de scale, $44/mês contra um MRR target de $10k. A Maia se paga se converter 1 usuário extra por mês.

### 6.3 Rate Limiting

- Free users: 10 mensagens/dia (incentiva upgrade)
- Paying users: 50 mensagens/dia
- Análise de render: automática e grátis (é upsell disfarçado)

## 7. Métricas de Sucesso

| Métrica | Baseline | Target (30d) | Target (90d) |
|---------|----------|-------------|-------------|
| Chat adoption rate | 0% | 30% dos ativos | 50% dos ativos |
| Renders após sugestão Maia | 0 | +15% renders/user | +30% renders/user |
| Trial→Paid conversão | 7.2% | 10% | 15% |
| Retenção D7 | ? | +20% vs baseline | +40% vs baseline |
| NPS/satisfação | ? | 4.0/5 | 4.5/5 |

## 8. Implementação (Fases)

### Fase 1: MVP — Chat + Análise (1-2 dias de dev)

**Escopo:**
- [ ] ChatWidget component (React, floating button + panel)
- [ ] API route `/api/maia/chat` (streaming)
- [ ] System prompt calibrado com tom da Maia
- [ ] Contexto básico do projeto injetado
- [ ] Análise de render pós-geração (vision)
- [ ] Tabela `maia_conversations` no Neon
- [ ] Rate limiting (10/dia free, 50/dia paid)

**Não inclui:** onboarding conversacional, sugestões proativas, histórico longo.

### Fase 2: Onboarding + Proatividade (3-5 dias)

**Escopo:**
- [ ] Onboarding conversacional (substitui tour atual)
- [ ] Mensagens proativas baseadas em comportamento
- [ ] Histórico de conversas com resumo automático
- [ ] A/B test: com Maia vs sem Maia (conversão)

### Fase 3: Integração Profunda (1-2 semanas)

**Escopo:**
- [ ] Maia sugere edições direto no canvas ("arrasta o sofá pra cá")
- [ ] Templates sugeridos pela Maia baseado no estilo
- [ ] Maia gera prompts otimizados pro render engine
- [ ] Integração com email drip (Maia personaliza emails)
- [ ] Maia no onboarding de referral ("seu amigo [nome] te indicou!")

## 9. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Maia dá conselho ruim | Média | Alto | System prompt rigoroso + review de logs |
| Custo escala inesperado | Baixa | Médio | Rate limiting + cache de respostas comuns |
| Usuário tenta jailbreak | Alta | Baixo | Guardrails no prompt + filtro de output |
| Latência do chat | Média | Médio | Streaming + Haiku como fallback |
| Usuário confunde com humano | Média | Baixo | Disclaimer "AI assistant" no widget |

## 10. Competidores

Nenhum tool de archviz/rendering tem um assistente de design integrado. Isso é diferencial real.

- **Planner 5D:** Tem sugestões automáticas mas são rule-based, não AI
- **HomeByMe:** Zero assistência de design
- **Midjourney/DALL-E:** Geram imagens mas sem feedback de design
- **Interior AI:** Gera renders mas sem iteração ou feedback

A Maia seria o primeiro assistente de design AI conversacional integrado numa ferramenta de rendering. Isso é posicionamento forte.

## 11. Decisões em Aberto

1. **Nome visível:** "Maia" ou outro nome? (Maia já tem presença no Reddit/Instagram)
2. **Idioma:** Multilíngue desde o MVP ou só inglês? (base global)
3. **Avatar:** Usar o branding existente da @studio.maia.arch?
4. **Gratuito ou premium?** Chat básico grátis, análise de render só pra pagantes?
5. **Modelo:** Sonnet 4.6 pra tudo ou Haiku pra chat simples + Sonnet pra análise?

---

**Próximo passo:** André aprova a spec → Criar issue no GitHub → Começar pela Fase 1 (MVP).
