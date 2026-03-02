# Plan 005 - Jido como Framework Base do Cazu

## Status
Em andamento (migração técnica 100% Jido concluída; em fase de rollout operacional)

## Owner
Cazu backend team

## Last updated
2026-02-28 (atualizado após fechamento do Task 6: pacote de testes/hardening)

---

## 1) Decisão

Vamos adotar **Jido** como framework principal de runtime/orquestração de agentes no Cazu.

Diretriz prática:
- **Jido vira o cérebro de decisão** (`cmd/2`, ações, diretivas, sinais).
- **Phoenix + Ecto + Oban + integrações atuais permanecem** como espinha operacional.
- O projeto fica **model-agnostic**: OpenAI/Anthropic/Gemini/etc entram via adapter, sem acoplar o core.

---

## 2) Missão do Cazu e como Jido ajuda

Missão do Cazu (MVP): agente SaaS multi-tenant para operação assistida no Conta Azul, com segurança, rastreabilidade e automação confiável.

Jido ajuda diretamente em 5 eixos:

1. **Previsibilidade de decisão**
   - `cmd/2` como função pura reduz comportamento errático.
   - Fácil reproduzir bugs e comparar decisões.

2. **Separação limpa de responsabilidades**
   - Ação decide estado.
   - Diretiva descreve efeito externo.
   - Runtime executa efeito.

3. **Escalabilidade organizacional**
   - Múltiplos agentes/fluxos sem GenServer ad hoc por todo lado.
   - Hierarquia/sinais padronizados.

4. **Testabilidade real**
   - Testes do cérebro sem depender de processo/IO.
   - Menos testes frágeis de ponta-a-ponta para cobrir regras.

5. **Governança e auditoria**
   - Eventos e diretivas mapeáveis para trilha auditável.
   - Melhor encaixe com políticas de confirmação, idempotência e LGPD baseline.

---

## 3) Princípios de adoção

1. **Sem reescrita Big Bang**
   - Trocar o núcleo de decisão por camadas, mantendo infraestrutura de execução.

2. **Compatibilidade funcional primeiro**
   - Não perder comportamento que já funciona (jobs, tool execution, auditoria, Telegram).

3. **Contrato estável entre decisão e execução**
   - Jido produz intenções/diretivas.
   - Adapter traduz para Oban/connector.

4. **Observabilidade desde o dia 1**
   - Toda decisão relevante gera evento rastreável.

---

## 4) Arquitetura alvo (MVP com Jido)

### 4.1 Camadas

1. **Channel Layer (entrada)**
   - Telegram webhook / chat UI.
   - Parsing de mensagem e identidade.

2. **Agent Core (Jido)**
   - Agente por conversa/contexto.
   - `cmd/2` recebe ação e retorna novo estado + diretivas.

3. **Execution Layer (existente)**
   - Oban workers executam tool calls.
   - Connectors Conta Azul fazem IO externo.

4. **Governance Layer**
   - Policies de confirmação/escrita.
   - Idempotência e autorização por tenant/user.

5. **Persistence Layer**
   - Ecto/Postgres para estado operacional, auditoria e histórico.

### 4.2 Contrato de diretivas (proposto)

Diretivas Jido suportadas no Cazu:
- `:enqueue_tool_call` (tool, args, context)
- `:ask_for_confirmation` (texto, payload)
- `:emit_user_message` (texto, metadata)
- `:record_audit_event` (tipo, payload)
- `:schedule_follow_up` (delay, action)
- `:halt_with_error` (tipo, detalhe)

Todas passam por adapter único antes de tocar side-effects.

### 4.3 Esquema formal de diretivas (versionado)

Definir envelope único para qualquer diretiva emitida por `cmd/2`:

- `directive_id` (UUID)
- `directive_type` (enum)
- `directive_version` (ex: `"v1"`)
- `tenant_id`
- `conversation_id`
- `user_id`
- `idempotency_key`
- `issued_at` (UTC)
- `payload` (map específico por tipo)

Regras:
- Toda diretiva inválida no schema é rejeitada no adapter e registrada como `agent.directive.invalid`.
- Mudança incompatível de payload exige nova versão (`v2`, etc).
- Adapter só executa diretivas em versões suportadas explicitamente.

### 4.4 Estratégia de rollout e rollback

- **Feature flag por tenant/canal**: `agent_runtime = :legacy | :jido`.
- **Canário inicial**: 5% dos tenants elegíveis no Web Chat.
- **Critério para expandir**: 7 dias com KPIs mínimos (erro interno < 1%, sem incidentes críticos).
- **Rollback imediato**: chave operacional para retornar tenant/canal ao runtime legado sem deploy.
- **Fail-safe**: em erro estrutural de adapter, responder mensagem padrão ao usuário + fallback para fila legada do turn seguinte.

---

## 5) Mudanças técnicas por módulo

### 5.1 `Cazu.Orchestrator`

Hoje: centraliza parsing, validação, enqueue, dedupe.

Evolução:
- virar coordenador fino de request/response.
- delegar decisão para `Cazu.Agents.ChatAgent.cmd/2`.
- manter compatibilidade com policy e tenancy já existentes.

### 5.2 `Cazu.Tools` + `Cazu.Workers.ToolExecutionWorker`

Mantém como está no essencial, com ajuste de contrato:
- workers passam a receber payload padronizado vindo de diretiva.
- erros normalizados para taxonomia única.

### 5.3 `Cazu.Policies`

Entra como gate oficial antes de executar diretiva sensível:
- escrita sem confirmação => bloqueia
- tool fora de allowlist tenant => bloqueia
- escopo inválido por usuário => bloqueia

### 5.4 Novo pacote local de agentes

Adicionar:
- `lib/cazu/agents/chat_agent.ex`
- `lib/cazu/agents/actions/*.ex`
- `lib/cazu/agents/state.ex`
- `lib/cazu/agents/directives/*.ex`
- `lib/cazu/agents/runtime_adapter.ex`

---

## 6) Fluxos críticos em Jido

### 6.1 Fluxo leitura (sem confirmação)

1. Mensagem do usuário chega.
2. Orchestrator monta ação (`UserMessageReceived`).
3. `ChatAgent.cmd/2` decide tool de leitura.
4. Diretiva `enqueue_tool_call`.
5. Worker executa.
6. Resultado volta como nova ação (`ToolResultReceived`).
7. `ChatAgent.cmd/2` gera resposta final ao usuário.

### 6.2 Fluxo escrita (com confirmação)

1. Usuário pede operação de escrita.
2. `ChatAgent.cmd/2` gera `ask_for_confirmation`.
3. Usuário confirma.
4. Nova ação `UserConfirmed`.
5. `cmd/2` emite `enqueue_tool_call`.
6. Worker executa + auditoria.
7. Agente responde sucesso/erro com contexto.

### 6.3 Falha de autenticação integração

1. Tool retorna `:reauth_required`.
2. `ToolResultReceived` entra no agente.
3. `cmd/2` gera mensagem orientada + status de integração pendente.
4. Runtime envia instrução de reautenticação.

---

## 7) Modelo de estado do agente (mínimo)

Estado sugerido em `ChatAgent`:
- `tenant_id`
- `conversation_id`
- `user_id`
- `integration_status`
- `pending_confirmation` (operação aguardando OK)
- `last_tool_calls` (janela curta)
- `policy_flags`
- `memory_window_ref` (ponte para contexto persistido)

Regra: estado do agente é operacional e curto. Histórico durável fica no banco.

### 7.1 Persistência e migrações necessárias

Criar/ajustar estruturas para suportar rastreabilidade do novo runtime:

1. `agent_turns`
   - `tenant_id`, `conversation_id`, `user_id`, `agent_version`, `started_at`, `completed_at`, `status`

2. `agent_directives`
   - `directive_id`, `directive_type`, `directive_version`, `idempotency_key`, `payload`, `status`, `blocked_reason`

3. `tool_executions`
   - `tool_name`, `request_payload`, `result_payload`, `error_type`, `latency_ms`

4. `llm_usage_events`
   - `provider`, `model`, `input_tokens`, `output_tokens`, `total_cost_usd`, `latency_ms`

5. Índices obrigatórios
   - `(tenant_id, conversation_id, inserted_at)`
   - `idempotency_key` (unique por tenant)
   - `directive_id` (unique global)

---

## 8) LLM provider abstraction (model-agnostic)

### 8.1 Contrato único

Definir interface interna:
- `generate_response(prompt, opts)`
- `tool_calling(prompt, tool_schema, opts)`
- `stream_response(prompt, opts)`

Implementações (decisão atual):
- `Cazu.LLM.Providers.OpenAI` (único no MVP)
- arquitetura pronta para adicionar Anthropic/Gemini depois
- provider default por tenant/plano = OpenAI

### 8.2 Política de seleção de modelo

Por tenant/plano/conversa:
- `default_model`
- `max_cost_per_turn`
- `max_latency_ms`
- `allowed_providers`

Se provider falhar:
- retry controlado
- sem fallback automático no MVP (fail-fast)
- registrar evento de falha e retornar erro claro ao usuário.

---

## 9) Observabilidade e auditoria

### 9.1 Eventos obrigatórios

- `agent.turn.started`
- `agent.action.decided`
- `agent.directive.emitted`
- `agent.directive.blocked_policy`
- `agent.directive.invalid`
- `tool.execution.started`
- `tool.execution.succeeded`
- `tool.execution.failed`
- `agent.turn.completed`

### 9.2 Campos mínimos de rastreio

- `tenant_id`
- `conversation_id`
- `user_id`
- `agent_version`
- `provider/model`
- `input_tokens/output_tokens`
- `total_cost_usd`
- `latency_ms`
- `idempotency_key`
- `directive_id`

---

## 10) Segurança e compliance

1. **Multi-tenant hard isolation**
   - query sempre escopada por `tenant_id`.

2. **Ações sensíveis com política de aprovação por risco**
   - operações high-risk exigem confirmação explícita.
   - operações low-risk podem seguir por auto-approve, com auditoria completa.

3. **Sanitização e sigilo**
   - token OAuth e segredos fora de logs.

4. **Auditoria imutável**
   - eventos críticos com trilha completa.

5. **Retenção e direito de exclusão**
   - preparar job operacional para delete/export por tenant.

---

## 11) Plano de implementação (4 sprints)

### Sprint 1 - Fundação Jido + contratos

**Objetivo:** criar base sem quebrar runtime.

**Janela sugerida:** Semana 1-2  
**Owner sugerido:** Backend Lead + 1 engineer  
**Dependências:** nenhuma

**Entregáveis:**
- Dependência Jido integrada.
- `ChatAgent` mínimo com estado e 3 ações:
  - `UserMessageReceived`
  - `ToolResultReceived`
  - `UserConfirmed`
- Diretivas básicas (`enqueue_tool_call`, `emit_user_message`, `ask_for_confirmation`).
- `RuntimeAdapter` traduzindo diretivas para infraestrutura atual.
- Schema `directive_version v1` validado no adapter.
- Testes unitários de `cmd/2` cobrindo decisões básicas.

**Critério de pronto:**
- turn simples (leitura) completo via Jido.

### Sprint 2 - Fluxos de escrita + políticas

**Objetivo:** governança real.

**Janela sugerida:** Semana 3-4  
**Owner sugerido:** Backend engineer (Policies) + Backend engineer (Agent)  
**Dependências:** Sprint 1

**Entregáveis:**
- Fluxo confirmação para escrita end-to-end.
- Integração total com `Cazu.Policies`.
- Taxonomia de erro normalizada.
- Mensagens de erro orientadas por tipo (`reauth`, `validation`, `transient`).
- Persistência de turn/directive/tool execution com migrações.

**Critério de pronto:**
- escrita high-risk sem confirmação é sempre bloqueada.
- escrita low-risk segue por auto-approve auditável.

### Sprint 3 - Provider abstraction + custo/latência

**Objetivo:** model-agnostic de verdade.

**Janela sugerida:** Semana 5-6  
**Owner sugerido:** Backend engineer (LLM) + Data/Observability support  
**Dependências:** Sprint 1-2

**Entregáveis:**
- Abstração de provider com OpenAI (MVP) e interface pronta para novos providers.
- Config por tenant/plano para modelo default.
- Logs e tabela de uso/custo por turno (sem teto de custo no MVP).
- Estratégia de falha = fail-fast (sem fallback automático).

**Critério de pronto:**
- trocar provider sem mexer no fluxo de agente.

### Sprint 4 - Hardening de produção

**Objetivo:** estabilidade operacional.

**Janela sugerida:** Semana 7-8  
**Owner sugerido:** Tech Lead + SRE/Platform support  
**Dependências:** Sprint 1-3

**Entregáveis:**
- Bench de carga básico para 100+ turns concorrentes.
- Runbook de incidentes (provider fora, Conta Azul 401, Oban atrasado).
- Painel mínimo com erro/latência/custo.
- Revisão de segurança e checklist LGPD baseline.
- Rollout canário + mecanismo de rollback validado em produção.

**Critério de pronto:**
- operação estável e auditável para onboarding de tenants iniciais.

---

## 12) Critérios de sucesso (KPIs)

1. **Confiabilidade**
   - >= 99% turns sem erro interno.

2. **Governança**
   - 100% das escritas com auditoria.
   - 100% das escritas high-risk com confirmação explícita.

3. **Desempenho**
   - p95 resposta de leitura < 4s (sem depender de tool lenta externa).

4. **Qualidade operacional**
   - retrabalho manual por erro de decisão reduzido em >= 50%.

5. **Portabilidade de modelo**
   - OpenAI operando no contrato único.
   - pelo menos 1 provider adicional plugável sem refactor estrutural.

---

## 13) Riscos e mitigação

1. **Risco:** curva de adoção Jido no time
   - Mitigação: guias internos + exemplos de ação/diretiva reais do Cazu.

2. **Risco:** acoplamento indevido no adapter
   - Mitigação: contrato de diretiva explícito + testes de contrato.

3. **Risco:** complexidade de estado do agente
   - Mitigação: estado curto, persistência durável no banco, limites claros.

4. **Risco:** custo de LLM imprevisível
   - Mitigação: observabilidade de custo por turno/tenant, alertas operacionais, rate limit por tenant e revisão periódica de modelo.

5. **Risco:** regressão em produção no corte para Jido
   - Mitigação: rollout canário por tenant + rollback por feature flag sem redeploy.

---

## 14) Backlog técnico inicial (tickets sugeridos)

1. `CAZU-001` Add Jido dependency + base modules.
2. `CAZU-002` Implement ChatAgent state/actions skeleton.
3. `CAZU-003` Implement RuntimeAdapter for directives -> Oban/Telegram/Audit.
4. `CAZU-004` Integrate Orchestrator with ChatAgent command loop.
5. `CAZU-005` Confirmation flow for write operations.
6. `CAZU-006` Normalize tool error taxonomy.
7. `CAZU-007` Provider abstraction v1 (OpenAI only no MVP, com contrato plugável para futuros providers).
8. `CAZU-008` Usage/cost telemetry pipeline.
9. `CAZU-009` Load test + runbook.
10. `CAZU-010` Security review and LGPD baseline checklist.
11. `CAZU-011` Directive schema validation + versioning (`v1`).
12. `CAZU-012` Rollout/rollback control via feature flag per tenant/channel.

---

## 15) Decisões fechadas (2026-02-28)

1. **Provider MVP:** OpenAI.
2. **Estratégia de falha:** fail-fast (sem fallback automático entre providers).
3. **Custo por turno:** sem teto no MVP (somente observabilidade e alertas).
4. **Aprovação de ações:** auto-approve para low-risk, confirmação para high-risk.
5. **Canal prioritário:** Web Chat no ciclo inicial (Telegram continua suportado).
6. **Gestão de tickets:** flexível (markdown `CAZU-xxx` ou Linear/GitHub, conforme conveniência).

---

## 16) Situação atual e tarefas concluídas (2026-02-28)

Status de execução:
- Jido 2.0 integrado no projeto.
- `ChatAgent` e ações principais ativos em `Jido.Agent` / `Jido.Action`.
- `ConversationTurnWorker` já no loop `cmd/2`.
- **`ToolExecutionWorker` migrado para loop Jido (concluído).**
- **Fallback legado de parsing removido do fluxo principal (concluído).**
- **AgentServer por conversa concluído (`Jido.AgentServer` + cleanup/TTL operacional).**
- **Contrato de diretivas v1 validado no adapter (concluído).**
- **Provider abstraction concluída (`Cazu.LLM.Provider` + provider OpenAI).**
- **Pacote de testes de fechamento reforçado (unit + integration + e2e) e `mix precommit` verde.**

### Tarefa concluída: `ToolExecutionWorker` -> Jido loop

Implementado:
- Resultado de tool agora entra como ação `ToolResultReceived` no `ChatAgent`.
- `ChatAgent.cmd/2` decide follow-up/recovery via diretivas (`EmitUserMessage` / `EnqueueToolCall`).
- `RuntimeAdapter` executa as diretivas para side-effects reais (mensagem/enqueue).
- `ToolExecutionWorker` deixou de conter decisão de negócio de follow-up/recovery no fluxo principal.
- Persistência de metadata de conversa ajustada para refletir decisões por diretiva (`tool_result`, `tool_failure_recovery`, `tool_follow_up_selected`).

### Tarefa concluída: remover fallback legado de parsing no fluxo principal

Implementado:
- `ConversationTurnWorker` não usa mais `parse_legacy_tool_command` por padrão em erros de LLM.
- Caminho legado ficou explícito atrás de feature flag: `:agent_runtime, legacy_command_fallback_enabled`.
- Default do projeto definido como `false`.
- Configuração por ambiente adicionada via env var `AGENT_LEGACY_COMMAND_FALLBACK_ENABLED`.
- Testes cobrindo os dois cenários:
  - default sem fallback;
  - fallback somente quando explicitamente habilitado.

### Tarefa concluída: AgentServer por conversa (`Jido.AgentServer`)

Implementado:
- `Cazu.Agents.ConversationAgentServer` usa `Cazu.Jido.start_agent/2` + `Jido.AgentServer.call/3` por conversa.
- Identidade de agente por conversa formalizada em `agent_id` estável (`conversation:<tenant_id>:<conversation_id>`).
- `ChatAgent` recebeu `signal_routes` para ações de conversa:
  - `cazu.user_message_received`
  - `cazu.tool_result_received`
  - `cazu.user_confirmed`
- `ConversationTurnWorker` e `ToolExecutionWorker` aplicam ações via runtime stateful em `Jido.AgentServer`.
- `ChatAgent` usa hooks `on_before_cmd`/`on_after_cmd` para expor diretivas da rodada (`runtime_last_directives`) ao adapter atual.
- Cleanup/TTL operacional implementado em `Cazu.Agents.ConversationAgentLifecycle`:
  - rastreio de atividade por agente de conversa (`touch`),
  - prune periódico,
  - stop automático de agentes ociosos.
- Configuração operacional adicionada:
  - `conversation_agent_idle_timeout_ms` (`AGENT_CONVERSATION_IDLE_TIMEOUT_MS`)
  - `conversation_agent_prune_interval_ms` (`AGENT_CONVERSATION_PRUNE_INTERVAL_MS`)
- Testes unitários cobrem:
  - continuidade de estado entre ações da mesma conversa,
  - prune removendo agente ocioso.

### Tarefa concluída: contrato de diretivas v1 no `RuntimeAdapter`

Implementado:
- Adapter passou a construir envelope versionado `v1` por diretiva com campos canônicos:
  - `directive_id`, `directive_type`, `directive_version`, `tenant_id`, `conversation_id`, `user_id`, `idempotency_key`, `issued_at`, `payload`.
- Validação obrigatória de envelope antes de side-effect:
  - `directive_type`
  - `directive_version`
  - `idempotency_key`
  - `payload` por tipo.
- Adapter executa apenas diretivas em versão suportada (`v1`).
- Diretiva inválida é bloqueada com erro `{:directive_invalid, reason}` e auditada via evento `agent.directive.invalid`.

### Tarefa concluída: provider abstraction (`Cazu.LLM.Provider`)

Implementado:
- Interface de provider centralizada em `Cazu.LLM.Provider`.
- Implementação concreta `Cazu.LLM.Providers.OpenAI` delegando para `OpenAIResponses`.
- Seleção de provider por configuração (`config :cazu, :llm, provider: ...`) com default OpenAI.
- Workers e ações críticas migrados para depender da interface:
  - `ConversationTurnWorker` (seleção de ação via LLM)
  - `ToolResultReceived` (follow-up/sumarização pós-tool)
- Critério atendido: worker/agente não dependem diretamente de módulo OpenAI concreto.

### Tarefa concluída: hardening final de testes e cobertura Jido-first

Implementado:
- Novos testes de integração da abstração de provider no fluxo real:
  - `ConversationTurnWorker` usando provider fake configurável.
  - `ToolResultReceived` validando follow-up message/tool via provider fake.
- Testes de contrato do adapter v1 adicionados e estabilizados.
- Testes de lifecycle/cleanup de agentes por conversa estabilizados com monitor de processo (`Process.monitor/1`) para evitar flakiness.
- Cobertura reforçada para os fluxos críticos Jido-first com `mix precommit` verde.

Arquivos principais atualizados:
- `lib/cazu/agents/conversation_agent_server.ex`
- `lib/cazu/agents/conversation_agent_lifecycle.ex`
- `lib/cazu/agents/chat_agent.ex`
- `lib/cazu/agents/runtime_adapter.ex`
- `lib/cazu/llm/provider.ex`
- `lib/cazu/llm/providers/openai.ex`
- `lib/cazu/application.ex`
- `lib/cazu/workers/conversation_turn_worker.ex`
- `lib/cazu/workers/tool_execution_worker.ex`
- `lib/cazu/agents/actions/tool_result_received.ex`
- `config/config.exs`
- `config/runtime.exs`
- `.env.example`
- `test/cazu/agents/conversation_agent_server_test.exs`
- `test/cazu/agents/conversation_agent_lifecycle_test.exs`
- `test/cazu/agents/runtime_adapter_test.exs`
- `test/cazu/llm/provider_test.exs`
- `test/cazu/agents/tool_result_received_provider_test.exs`
- `test/support/fake_llm_provider.ex`
- `test/cazu/workers/conversation_turn_worker_test.exs`

Validação executada:
- `mix test test/cazu/llm/provider_test.exs test/cazu/agents/runtime_adapter_test.exs test/cazu/agents/tool_result_received_provider_test.exs test/cazu/agents/chat_agent_test.exs test/cazu/workers/conversation_turn_worker_test.exs test/cazu/workers/tool_execution_worker_test.exs`
- `mix test test/cazu_web/e2e/agent_chat_live_e2e_test.exs test/cazu_web/e2e/telegram_webhook_e2e_test.exs test/cazu/llm/openai_responses_test.exs`
- `mix precommit` ✅

---

## 17) Pendências para fechamento da migração 100% Jido

Checklist de fechamento:

- [x] **Migrar `ToolExecutionWorker` para loop Jido completo**
  - Critério atendido: decisão de follow-up/recovery foi movida para `ToolResultReceived` + `ChatAgent.cmd/2` + diretivas.

- [x] **Remover fallback legado de parsing de comando**
  - Dependência removida do fluxo principal de erro/decisão.
  - Critério atendido: caminho legado existe apenas atrás de feature flag explícita (`legacy_command_fallback_enabled`) e desligada por padrão.

- [x] **Introduzir AgentServer por conversa (runtime stateful Jido)**
  - Critério atendido: ciclo principal roda em agente vivo com `Jido.AgentServer`, com lookup estável por conversa e cleanup/TTL operacional para agentes inativos.

- [x] **Formalizar contrato de diretivas com versão (`v1`)**
  - Critério atendido: validação de envelope no adapter (`directive_type`, `directive_version`, `payload`, `idempotency_key`) e bloqueio auditado de diretiva inválida (`agent.directive.invalid`).

- [x] **Provider abstraction real (desacoplar `OpenAIResponses`)**
  - Critério atendido: interface `Cazu.LLM.Provider` + implementação OpenAI + seleção por config, com workers/agente dependendo da abstração.

- [x] **Pacote de testes de fechamento da migração**
  - Critério atendido: cobertura unit/integration/e2e dos fluxos críticos Jido-first com `mix precommit` verde.

---

## 18) Próxima sequência sugerida (ajustada)

1) Rollout/canário operacional com monitoramento de KPIs
2) Runbook de incidentes e alertas de custo/latência
3) Onboarding gradual de tenants elegíveis
