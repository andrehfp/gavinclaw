# Plan 006 - Jido Execution Roadmap (Cazu)

## Status
Aprovado para execução

## Last updated
2026-02-28

## Input de produto já fechado
- Provider MVP: OpenAI
- Estratégia de falha: fail-fast
- Sem teto de custo no MVP (com observabilidade)
- Aprovação: auto-approve low-risk, confirmação high-risk
- Canal prioritário: Web Chat (Telegram segue suportado)

---

## 1) Escopo de execução (6 semanas)

### Semana 1 - Base Jido no projeto
**Objetivo:** colocar Jido no core sem quebrar runtime atual.

Entregas:
- Dependência Jido adicionada e compilando.
- `Cazu.Agents.ChatAgent` com estado mínimo.
- Ações: `UserMessageReceived`, `ToolResultReceived`, `UserConfirmed`.
- Diretivas: `enqueue_tool_call`, `emit_user_message`, `ask_for_confirmation`.
- Testes unitários de `cmd/2` (decisão pura).

DoD:
- `mix test` verde.
- 1 fluxo de leitura rodando ponta-a-ponta via Web Chat.

---

### Semana 2 - Runtime Adapter + integração Orchestrator
**Objetivo:** conectar cérebro Jido à infraestrutura existente.

Entregas:
- `RuntimeAdapter` traduzindo diretivas para Oban/Telegram/Audit.
- `Cazu.Orchestrator` delegando decisão para `ChatAgent.cmd/2`.
- Contrato único de payload entre agente e workers.
- Teste de contrato adapter<->worker.

DoD:
- tool de leitura executando com rastreio completo em audit.
- sem regressão em Telegram webhook.

---

### Semana 3 - Governança por risco (auto-approve vs confirmação)
**Objetivo:** política corporativa no centro da execução.

Entregas:
- Matriz de risco por tool (`low_risk`, `high_risk`).
- `Cazu.Policies` aplicando:
  - low-risk => auto-approve
  - high-risk => bloqueio até confirmação explícita
- Estados de aprovação no agente (`pending_confirmation`).
- Mensagens UX claras para confirmação.

DoD:
- 100% de high-risk bloqueadas sem confirmação.
- 100% de low-risk auditadas em auto-approve.

---

### Semana 4 - Web Chat primeiro, Telegram em paralelo
**Objetivo:** consolidar canal principal no Web Chat.

Entregas:
- Jornada principal otimizada no `AgentChatLive`.
- Streaming de status de tool call no chat.
- Componente visual de confirmação de operações high-risk.
- Paridade funcional mínima com Telegram.

DoD:
- usuário resolve fluxo completo sem sair do Web Chat.
- testes e2e do Web Chat cobrindo leitura + escrita confirmada.

---

### Semana 5 - Observabilidade de custo/latência + fail-fast
**Objetivo:** operação com métrica real e falhas previsíveis.

Entregas:
- Tracking por turno: tokens, custo, latência, provider/model.
- Dashboard/consulta operacional de custo por tenant.
- Política fail-fast aplicada no provider layer.
- Taxonomia de erro final (validation/not_found/reauth/transient/provider).

DoD:
- incidentes de provider retornam erro claro ao usuário.
- custo por conversa visível sem query manual complexa.

---

### Semana 6 - Hardening e preparo de scale inicial
**Objetivo:** deixar pronto para onboarding de tenants iniciais.

Entregas:
- Load test 100+ turns concorrentes.
- Runbook (provider down, Conta Azul 401, Oban backlog).
- Limpeza de débito técnico do fluxo legado redundante.
- Revisão de segurança multi-tenant + LGPD baseline.

DoD:
- p95 de leitura em alvo definido.
- checklist de produção assinado.

---

## 2) Matriz de risco de tool (política inicial)

> Ajustável conforme operação real.

### High-risk (sempre confirmação)
- criar/alterar/excluir cobranças
- criar/alterar/excluir lançamentos financeiros
- baixas/liquidações financeiras
- qualquer operação com impacto contábil irreversível

### Low-risk (auto-approve + auditoria)
- listagens
- consultas de status
- busca de dados de cliente/produto sem mutação
- health checks e leituras operacionais

---

## 3) Sequência de commits sugerida

1. `feat(jido): add dependency and base agent modules`
2. `feat(agent): implement chat state and core actions`
3. `feat(agent): add directive structs and runtime adapter`
4. `refactor(orchestrator): delegate decision loop to ChatAgent.cmd/2`
5. `feat(policy): introduce risk matrix and approval gates`
6. `feat(webchat): wire tool status + confirmation UX`
7. `feat(llm): provider abstraction openai + fail-fast strategy`
8. `feat(observability): usage cost and latency tracking`
9. `test(e2e): add webchat read/write governance journeys`
10. `docs(runbook): incidents + production checklist`

---

## 4) PR checklist (padrão para cada sprint)

- [ ] Mudança respeita isolamento por `tenant_id`
- [ ] Sem segredo em logs
- [ ] Auditoria para toda ação externa
- [ ] Testes unitários do `cmd/2` cobrindo decisão
- [ ] Teste de integração adapter->worker
- [ ] Migração de banco versionada (se houver)
- [ ] Documentação atualizada em `plans/` ou `docs/`
- [ ] Cenário de falha explícito validado (fail-fast)

---

## 5) KPIs operacionais de acompanhamento semanal

1. `% turns com erro interno`
2. `latência p95 leitura`
3. `tempo médio de conclusão de escrita high-risk`
4. `% high-risk bloqueadas corretamente sem confirmação`
5. `custo médio por conversa (USD)`
6. `retries por tool`

---

## 6) Primeiras 10 tasks executáveis (ordem prática)

1. Criar `lib/cazu/agents/chat_agent.ex`
2. Criar `lib/cazu/agents/state.ex`
3. Criar `lib/cazu/agents/actions/user_message_received.ex`
4. Criar `lib/cazu/agents/actions/tool_result_received.ex`
5. Criar `lib/cazu/agents/actions/user_confirmed.ex`
6. Criar `lib/cazu/agents/runtime_adapter.ex`
7. Integrar loop no `Cazu.Orchestrator`
8. Implementar matriz de risco inicial em `Cazu.Policies`
9. Adicionar componente de confirmação no Web Chat
10. Adicionar telemetria de custo/latência por turno

---

## 7) Definição de pronto do MVP Jido-first

MVP considerado pronto quando:
- Web Chat resolve jornadas de leitura e escrita com governança por risco.
- High-risk exige confirmação sempre.
- Low-risk roda automático com auditoria.
- OpenAI provider está estável e fail-fast.
- Custo/latência por tenant são rastreáveis.
- Runbook operacional testado.
