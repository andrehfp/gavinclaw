# Plan 007 - OpenAI Realtime WebSocket no Cazu

## Status
Proposto

## Owner
Cazu backend team

## Last updated
2026-02-28

---

## 1) Objetivo

Implementar integração com **OpenAI Realtime via WebSocket** para reduzir latência e melhorar experiência de streaming no chat, mantendo governança atual (políticas, auditoria, confirmação de ações de risco e idempotência).

Resultado esperado do MVP:
- streaming de resposta mais fluido (texto)
- continuidade de fluxo com tool calls
- fallback seguro para o fluxo atual (`Responses API`)
- observabilidade completa (latência, erros, uso)

---

## 2) Decisão de arquitetura

### Decisão principal
Adotar **server-side relay**:

`LiveView/Telegram -> Phoenix (Cazu) -> OpenAI Realtime WS`

### Motivos
- API key fica somente no backend.
- Reuso do modelo atual de governança (Policies, RuntimeAdapter, Orchestrator).
- Reuso do `AgentChatStream` para eventos em tempo real.
- Controle de reconexão, timeout, cancelamento e fallback em um único ponto.

### Não escopo do MVP
- conexão WS direta browser -> OpenAI com token efêmero
- áudio bidirecional em produção (entra na fase 2)

---

## 3) Estado atual (baseline)

Hoje o fluxo principal usa:
- `Cazu.Workers.ConversationTurnWorker`
- `Cazu.LLM.Provider`
- `Cazu.LLM.Providers.OpenAI`
- `Cazu.LLM.OpenAIResponses` (HTTP + SSE)

Isso será mantido como **fallback** e rota de segurança.

---

## 4) Estratégia de rollout

1. Introduzir implementação Realtime atrás de flag:
   - `config :cazu, :llm, realtime_enabled: false`
2. Subir em staging com tráfego interno.
3. Ativar por tenant (allowlist).
4. Promover para produção gradualmente.

---

## 5) Fases de implementação

## Fase 1 - Fundação (infra + contrato)

### Entregas
- Nova dependência de cliente WS em Elixir (sugestão: `:websockex`).
- Config de runtime para realtime:
  - `OPENAI_API_KEY`
  - `OPENAI_REALTIME_MODEL`
  - timeouts/reconnect/backoff
- Definição de contrato interno de eventos realtime (entrada/saída).

### Arquivos alvo
- `mix.exs`
- `config/runtime.exs`
- `lib/cazu/llm/provider.ex` (extensão de contrato)

### DoD
- Projeto compila com cliente WS.
- Config validada em boot (erros claros).

---

## Fase 2 - Cliente Realtime WS (texto)

### Entregas
- Novo módulo `Cazu.LLM.OpenAIRealtime` com:
  - abrir/fechar sessão WS
  - envio de eventos (`session.update`, `conversation.item.create`, `response.create`)
  - recebimento de eventos (`response.*.delta`, `response.completed`, `error`)
  - heartbeat/reconnect com backoff
  - normalização para formato interno consumível pelo worker

### Arquivos alvo
- `lib/cazu/llm/openai_realtime.ex` (novo)
- `lib/cazu/llm/providers/openai.ex` (delegação para realtime quando habilitado)
- `lib/cazu/agent_trace.ex` (novos eventos de tracing)

### DoD
- Fluxo simples “user text -> stream delta -> response completed” funcionando em teste de integração.

---

## Fase 3 - Gerência de sessão por conversa

### Entregas
- `Cazu.LLM.RealtimeSessionSupervisor` (DynamicSupervisor)
- `Cazu.LLM.RealtimeSessionServer` (1 processo por `{tenant_id, chat_id}`)
- TTL de sessão inativa e limpeza automática.
- API para:
  - `start_or_get_session/2`
  - `send_user_text/3`
  - `cancel_response/2`
  - `close_session/2`

### Arquivos alvo
- `lib/cazu/llm/realtime_session_supervisor.ex` (novo)
- `lib/cazu/llm/realtime_session_server.ex` (novo)
- `lib/cazu/application.ex` (supervision tree)

### DoD
- Sessões isoladas por conversa e sem vazamento de estado entre tenants.

---

## Fase 4 - Integração com pipeline atual (worker + governança)

### Entregas
- `ConversationTurnWorker` passa a usar Realtime quando habilitado.
- Reuso da decisão atual de tool execution:
  - validação de política (`Policies`)
  - diretivas via `ChatAgent` + `RuntimeAdapter`
  - enfileiramento de tools via `Orchestrator`
- Fallback automático para `OpenAIResponses` em caso de falha não recuperável do WS.

### Arquivos alvo
- `lib/cazu/workers/conversation_turn_worker.ex`
- `lib/cazu/llm/provider.ex`
- `lib/cazu/llm/providers/openai.ex`

### DoD
- Nenhuma regressão funcional no fluxo atual de tool calling.
- Falha no realtime não interrompe operação (fallback ativo).

---

## Fase 5 - LiveView e UX de streaming

### Entregas
- Continuar emitindo eventos via `AgentChatStream`:
  - `assistant_stream_start`
  - `assistant_stream_delta`
  - `assistant_message`
  - `phase`
- Ajuste fino de UX:
  - indicador de pensamento
  - cancelamento de resposta em andamento
  - clareza de fase (thinking/tool-running/idle)

### Arquivos alvo
- `lib/cazu/agent_chat_stream.ex`
- `lib/cazu_web/live/agent_chat_live.ex`
- `lib/cazu_web/live/agent_chat_live.html.heex` (se necessário)

### DoD
- Streaming em tempo real perceptivelmente fluido no chat web.

---

## Fase 6 - Observabilidade, limites e hardening

### Entregas
- Métricas:
  - latência até 1º delta
  - latência total de resposta
  - taxa de erro WS por tipo
  - reconexões por sessão
- Limites:
  - timeout por resposta
  - cancelamento explícito
  - proteção de burst por chat
- Logging seguro sem payload sensível.

### Arquivos alvo
- `lib/cazu_web/telemetry.ex`
- `lib/cazu/agent_trace.ex`
- configuração de runtime

### DoD
- Dashboard básico operacional + runbook de falhas.

---

## 6) Fase 2 (após MVP): áudio bidirecional

## Escopo
- Captura de microfone no cliente (LiveView hook).
- Envio incremental de áudio para backend e repasse via Realtime WS.
- Reprodução incremental de áudio de resposta.

## Arquivos prováveis
- `assets/js/` (hook externo)
- `lib/cazu_web/live/agent_chat_live.html.heex`
- `lib/cazu_web/live/agent_chat_live.ex`
- módulos de sessão realtime para `input_audio_buffer.*`

## Observações
- Exigir `phx-hook` com `id` único.
- Se hook controla DOM próprio: `phx-update="ignore"`.

---

## 7) Contrato técnico mínimo (interno)

## Entrada (app -> RealtimeSession)
- `{:user_text, text, metadata}`
- `{:tool_result, llm_response_id, llm_tool_call_id, result}`
- `:cancel_current_response`

## Saída (RealtimeSession -> app)
- `{:stream_start, response_id}`
- `{:stream_delta, response_id, delta}`
- `{:tool_call, response_id, tool_name, arguments, llm_tool_call_id}`
- `{:completed, response_id, assistant_message}`
- `{:error, reason, context}`

---

## 8) Plano de testes

### Unit
- parser de eventos WS (delta, tool_call, completed, error)
- lógica de reconexão/backoff
- normalização de payloads

### Integração
- worker com realtime habilitado
- fallback para responses em erro WS
- persistência de `previous_response_id` e continuidade do contexto

### LiveView
- submissão de mensagem e presença de stream no DOM
- estados de fase/typing
- cancelamento de resposta

---

## 9) Riscos e mitigação

1. **Mudança de protocolo/eventos no provider**
   - Mitigação: camada de normalização interna + testes de contrato.

2. **Sessão órfã por chat**
   - Mitigação: TTL + monitor + cleanup no supervisor.

3. **Regressão em tool call**
   - Mitigação: manter worker/políticas atuais e usar fallback automático.

4. **Custos por uso prolongado de sessão**
   - Mitigação: timeout de sessão inativa + métricas por tenant/chat.

---

## 10) Sequência sugerida de commits

1. `feat(llm): add realtime websocket dependency and runtime config`
2. `feat(llm): implement openai realtime client and event parser`
3. `feat(llm): add realtime session supervisor/server`
4. `feat(provider): route openai calls to realtime behind feature flag`
5. `feat(worker): integrate realtime turn flow with fallback`
6. `feat(liveview): wire realtime stream/cancel UX`
7. `feat(obs): add telemetry and trace for realtime lifecycle`
8. `test(realtime): add unit/integration/liveview coverage`

---

## 11) Definition of Done (MVP)

MVP concluído quando:
- chat web recebe streaming em tempo real via Realtime WS
- tool calls continuam governadas por políticas atuais
- fallback para Responses API está ativo e validado
- sem regressão nos fluxos existentes (Telegram + Web Chat)
- telemetria mínima operacional disponível
