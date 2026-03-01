# Plan 002 — Arquitetura Completa do Agente SaaS (MVP-first)

## Status
Proposto (pronto para implementação)

## Owner
Cazu backend team

## Last updated
2026-02-28

---

## 1) Contexto e premissas

Este plano define a arquitetura do nosso agente como produto SaaS, com foco em:

- **MVP rápido** (time-to-market máximo)
- **simplicidade operacional**
- **hospedagem própria** (deploy inicial em Railway)
- **multi-tenant desde o início**
- **compliance e segurança já no MVP** (LGPD/GDPR baseline)

Requisitos funcionais confirmados:

1. No primeiro chat, o próprio agente conduz bootstrap de identidade/comportamento.
2. Arquivos lógicos de contexto (`AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`) nascem no onboarding conversacional.
3. O agente pode editar esses documentos quando:
   - o usuário pedir explicitamente, ou
   - houver melhoria clara e segura (com trilha de auditoria).
4. Dashboard de edição pode ficar para depois (não é requisito de MVP).

---

## 2) Decisões arquiteturais (MVP)

### 2.1 Banco principal
- **Postgres como source of truth** para dados transacionais e contexto do agente.
- Sem banco secundário no MVP (evitar complexidade prematura).

### 2.2 Latência
- Postgres não é gargalo no MVP se o hot path for curto.
- Estratégia:
  - 1 leitura de perfil ativo compilado
  - 1 leitura de contexto curto da conversa
  - 1 escrita de evento/mensagem
- Operações pesadas ficam assíncronas via Oban.

### 2.3 Cache
- **Cache em memória local (ETS/GenServer)** para prompt/profile bundle ativo por agente.
- Invalidação por evento interno (PubSub).
- Redis fica como opção de fase 2, somente se necessário.

### 2.4 Memória semântica
- MVP: memória textual em Postgres (sem vector store dedicado).
- Fase 2: `pgvector` opcional para recall semântico quando houver evidência de necessidade.

### 2.5 Runtime
- Phoenix + Oban no mesmo projeto/release no início (simples de operar no Railway).

---

## 3) Modelo de domínio (multi-tenant)

## 3.1 Entidades principais

- `tenants`
- `users`
- `tenant_memberships`
- `agents`
- `agent_profile_versions`
- `agent_profile_docs`
- `conversations`
- `messages`
- `memory_entries`
- `tool_executions`
- `llm_response_usages` (tokens/custo por chamada LLM)
- `audit_events`
- `retention_policies`

## 3.2 Observações importantes

- Todas as tabelas de negócio com `tenant_id` obrigatório.
- Versionamento explícito para perfil do agente.
- Escritas de configuração sempre geram evento de auditoria.

## 3.3 Índices mínimos de desempenho

- `(tenant_id, agent_id, inserted_at desc)` em mensagens/memória
- `(tenant_id, external_id)` para dedupe/idempotência
- `(tenant_id, agent_id, active)` em versões de perfil
- `(tenant_id, conversation_id, inserted_at)` para histórico de chat
- `llm_response_usages(response_id)` único
- `llm_response_usages(tenant_id, conversation_id, inserted_at)` para análise por conversa/período
- `llm_response_usages(tenant_id, model, inserted_at)` para análise de custo por modelo

---

## 4) Contrato de “workspace lógico” (estilo OpenClaw, SaaS-safe)

Em vez de arquivos no disco, usaremos documentos lógicos versionados por agente:

- `AGENTS.md` (instruções operacionais)
- `SOUL.md` (persona/tom/limites)
- `IDENTITY.md` (nome/emoji/avatar/vibe)
- `USER.md` (perfil de quem usa)
- `MEMORY.md` (curadoria de longo prazo, opcional no MVP)
- `memory/YYYY-MM-DD.md` (pode começar como `memory_entries` no banco)

Representação sugerida:

- `agent_profile_versions` (cabeçalho da versão)
- `agent_profile_docs` (`doc_type`, `content`, `version_id`)

Benefício: versionamento, rollback e auditoria nativos, sem depender de FS local.

---

## 5) Bootstrap no primeiro chat (sem dashboard)

## 5.1 Fluxo

Se agente não tiver perfil inicial:

1. Entrar em modo bootstrap conversacional.
2. Perguntar nome do agente, vibe, emoji, como tratar usuário, timezone.
3. Gerar rascunho de `IDENTITY.md`, `USER.md`, `SOUL.md`, `AGENTS.md`.
4. Confirmar com usuário no chat.
5. Persistir versão `v1` e marcar agente como `bootstrapped`.

## 5.2 Regras

- Nunca bloquear o usuário por perfeccionismo de onboarding.
- Permitir “depois eu ajusto” e seguir operação.
- Toda gravação de perfil gera `audit_events`.

---

## 6) Edição de SOUL/IDENTITY/AGENTS pelo próprio agente

## 6.1 Ferramenta interna controlada

Criar tool interna, por exemplo `agent_profile_update`, com escopo restrito:

- docs permitidos: `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`
- sem acesso a políticas globais do sistema
- limite de tamanho
- bloqueio de conteúdo proibido
- escrita sempre versionada

## 6.2 Política de autorização

Permitir update quando:

- pedido explícito do usuário; ou
- melhoria operacional segura e não sensível (ex.: clarificar tom, registrar preferência de comunicação)

Exigir confirmação para alterações de maior impacto (ex.: mudança de identidade “forte”).

## 6.3 Auditoria

Registrar:

- quem iniciou (usuário/agent/system)
- diff resumido
- motivo
- timestamp
- versão anterior/nova

---

## 7) Pipeline de execução com baixa latência

## 7.1 Hot path (síncrono)

1. Receber mensagem
2. Resolver `tenant + agent + conversation`
3. Carregar profile bundle ativo (cache -> fallback banco)
4. Buscar janela curta de contexto (últimas N mensagens)
5. Montar prompt por camadas
6. Chamar LLM
7. Persistir resposta
8. Retornar ao canal

## 7.2 Cold path (assíncrono via Oban)

- extração de memória durável
- sumarização periódica
- compactação de histórico
- enriquecimentos futuros (embeddings)

Isso mantém tempo de resposta do usuário rápido.

---

## 8) Prompt em camadas (governança SaaS)

Ordem obrigatória:

1. **System policy global (imutável)**
2. **Policy por plano/produto**
3. **Perfil do agente do tenant** (`AGENTS/SOUL/IDENTITY/USER`)
4. **Memória/contexto recuperado**
5. **Mensagem atual do usuário**

Resultado: customização alta sem perder segurança/compliance.

---

## 9) Segurança e compliance (MVP baseline)

## 9.1 Isolamento multi-tenant
- `tenant_id` em tudo
- queries sempre escopadas
- **RLS no Postgres** onde aplicável

## 9.2 Segredos e credenciais
- segredos de tool/API criptografados em nível de aplicação
- nunca logar segredo em claro

## 9.3 Auditoria e rastreabilidade
- trilha para alterações de perfil, ações externas, falhas críticas

## 9.4 Privacidade
- minimização de dados
- política de retenção por tenant (padrão + override)
- suporte operacional para export/delete (LGPD/GDPR)

## 9.5 Guardrails de ação externa
- por padrão: modo conservador
- ações externas sensíveis com confirmação humana (quando aplicável)

## 9.6 FinOps básico (tokens/custo)
- registrar tokens de entrada (`input_tokens`) e saída (`output_tokens`) por resposta da LLM
- registrar custo de entrada (`input_cost_usd`) e saída (`output_cost_usd`) por resposta da LLM
- registrar custo total (`total_cost_usd`) por resposta da LLM
- permitir rastreio por `tenant_id`, `conversation_id`, `message_id/thread_id` e `model`
- manter trilha imutável para auditoria de consumo

---

## 10) Deploy no Railway (MVP)

## 10.1 Topologia inicial

- 1 serviço Phoenix (web + runtime + Oban)
- 1 Postgres gerenciado
- storage de arquivos opcional (somente se necessário)

## 10.2 Config operacional mínima

- migrations automáticas em pipeline controlado
- backups do Postgres habilitados
- métricas básicas de app + DB
- logs estruturados com `tenant_id`, `agent_id`, `conversation_id`

## 10.3 Escala inicial

- escala vertical primeiro (mais simples)
- escala horizontal depois, quando métricas exigirem

---

## 11) Escopo do MVP (in/out)

## 11.1 IN (MVP)

- arquitetura multi-tenant base
- bootstrap no primeiro chat
- docs de perfil (`AGENTS/SOUL/IDENTITY/USER`) versionados
- edição desses docs pelo agente com guardrails
- auditoria de mudanças
- pipeline de execução com hot path enxuto
- compliance baseline (retenção + segregação + trilha)

## 11.2 OUT (pós-MVP)

- dashboard completo para edição de perfil
- billing/plans complexos
- memória semântica com embeddings
- roteamento multicanal avançado

---

## 12) Roadmap de implementação (MVP rápido)

## Fase 1 — Fundamentos (dados + segurança)

1. Criar schema multi-tenant e migrations
2. Adicionar RLS/escopo obrigatório
3. Criar auditoria base
4. Criar modelo de `agent_profile_versions` + docs

**Saída da fase:** domínio pronto para profile versionado e isolamento seguro.

## Fase 2 — Runtime do agente (bootstrap + prompt)

1. Implementar fluxo bootstrap no primeiro chat
2. Implementar prompt builder por camadas
3. Implementar cache de profile bundle
4. Implementar escrita versionada de docs

**Saída da fase:** agente funcional com identidade/soul customizáveis via chat.

## Fase 3 — Edição pelo agente + guardrails

1. Implementar tool `agent_profile_update`
2. Regras de autorização/confirmação
3. Auditoria de diffs
4. Testes de regressão de segurança

**Saída da fase:** agente consegue manter o próprio perfil com segurança.

## Fase 4 — Performance/operação em Railway

1. Revisar índices e consultas do hot path
2. Mover tarefas pesadas para Oban
3. Adicionar telemetria p50/p95
4. Hardening de deploy/backup/alerta

**Saída da fase:** MVP pronto para produção inicial.

---

## 13) Critérios de aceite

1. Novo tenant cria agente e conclui bootstrap pelo chat sem intervenção manual.
2. `SOUL.md` e `IDENTITY.md` ficam persistidos/versionados e influenciam respostas.
3. Agente consegue atualizar docs permitidos por solicitação do usuário.
4. Cada alteração de doc gera evento de auditoria rastreável.
5. Hot path sem operações pesadas síncronas.
6. Isolamento por tenant validado por testes.

---

## 14) Riscos e mitigação

1. **Risco:** profile editing gerar drift indesejado.
   - **Mitigação:** versionamento + confirmação + rollback rápido.

2. **Risco:** latência subir com crescimento de histórico.
   - **Mitigação:** janela curta + sumarização assíncrona + índices.

3. **Risco:** vazamento entre tenants.
   - **Mitigação:** RLS + testes de isolamento + auditoria contínua.

4. **Risco:** escopo de MVP crescer demais.
   - **Mitigação:** manter dashboard, billing avançado e embeddings fora do MVP.

---

## 15) Medição de custo por mensagem (tokens in/out + custo in/out + custo total)

### 15.1 Fonte dos dados
- Usar `usage` retornado pela API de LLM em cada resposta.
- Persistir em `llm_response_usages` por chamada (`response_id` único).
- Relacionar com `tenant_id`, `conversation_id`, `thread_id/message_id` quando disponível.

### 15.2 Campos mínimos por chamada
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `cached_input_tokens` (quando disponível na API)
- `input_cost_usd`
- `output_cost_usd`
- `total_cost_usd`
- `model`
- `request_stage` (ex.: `select_next_action`, `tool_output`, `summary`)

### 15.3 Fórmulas de custo
Com tabela de preços por modelo (USD por 1M tokens):

- `input_cost_usd = (input_tokens / 1_000_000) * input_per_million`
- `output_cost_usd = (output_tokens / 1_000_000) * output_per_million`
- `total_cost_usd = input_cost_usd + output_cost_usd`

Observações:
- Arredondamento apenas na camada de apresentação (persistir valor completo possível).
- Se `total_tokens` não vier da API, calcular fallback: `input_tokens + output_tokens`.

### 15.4 Níveis de agregação necessários
- **Por mensagem/chamada**: custo exato de cada resposta.
- **Por conversa/thread**: soma de tokens e custo total.
- **Por tenant** (dia/mês): custo acumulado e custo por modelo.
- **Por estágio** (`request_stage`): custo de roteamento vs continuação de tool vs sumário.

### 15.5 Saída para produto e operação
- Expor métricas no dashboard/API:
  - tokens in/out
  - custo in/out
  - custo total
  - custo por modelo
  - custo por período
- Permitir export CSV por tenant/período para cobrança e auditoria.

### 15.6 Critério de aceite específico
1. Toda resposta de LLM persiste tokens/custo por chamada.
2. Conseguimos consultar custo total por conversa.
3. Conseguimos consultar custo diário/mensal por tenant.
4. Conseguimos quebrar custo por modelo e por estágio de request.

---

## 16) Próximo passo recomendado

Quebrar este plano em issues de implementação por fase (F1–F4), incluindo uma trilha de FinOps no MVP:
- migration/validação de `llm_response_usages`
- job de agregação diária por tenant/modelo
- endpoint/consulta para relatório de custo por conversa e por período
- alarms simples de custo (threshold por tenant)