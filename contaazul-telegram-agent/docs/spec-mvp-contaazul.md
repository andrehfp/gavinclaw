# Spec MVP - Conta Azul AI Agent (Elixir)

## Objetivo
Construir um agente de IA para operações financeiras no Conta Azul, operado por Telegram, com segurança, rastreabilidade e arquitetura multi-tenant.

## Decisão de arquitetura
- **Core backend:** Elixir + Phoenix
- **Fila e execução assíncrona:** Oban + Postgres
- **LLM orchestration:** tool-calling controlado no backend
- **Canal inicial:** Telegram bot único (com isolamento por tenant)
- **Integração ERP principal:** API oficial da Conta Azul via OAuth 2.0
- **HAR:** apenas fallback interno para debug, não onboarding de cliente

---

## Escopo funcional do MVP (v1)

### Finance
1. `finance.create_receivable`
2. `finance.create_payable`
3. `finance.list_installments`
4. `finance.acquit_installment`
5. `finance.get_receipt`
6. `finance.get_statement`

### CRM
7. `crm.create_client`
8. `crm.list_people`

---

## Fluxo do usuário (chat-first)
1. Usuário envia comando no Telegram.
2. Orchestrator interpreta intenção e seleciona tool(s).
3. Policy layer valida risco e confirmação.
4. Job é enfileirado no Oban.
5. Connector chama Conta Azul API.
6. Resultado e auditoria são persistidos.
7. Resposta é devolvida no Telegram.

---

## Segurança e governança (obrigatório)
- Escrita só com `confirm=true` (ou fluxo de aprovação explícito).
- Idempotência para todas as tools de escrita.
- Auditoria imutável por evento (`tool.started`, `tool.succeeded`, `tool.failed`).
- Segredos fora de código e fora de logs.
- Sanitização de payload em logs.
- Isolamento por `tenant_id/workspace_id`.
- Controle de autorização por usuário no tenant.

---

## OAuth 2.0 Conta Azul (login do usuário)

### 1) Solicitar código de autorização
Endpoint de login:
- `https://auth.contaazul.com/login`

Formato:
- `response_type=code`
- `client_id=...`
- `redirect_uri=...`
- `state=...`
- `scope=openid+profile+aws.cognito.signin.user.admin`

Exemplo:
`https://auth.contaazul.com/login?response_type=code&client_id=SEU_CLIENT_ID&redirect_uri=SUA_REDIRECT_URI&state=ESTADO&scope=openid+profile+aws.cognito.signin.user.admin`

Após login/consentimento:
`SUA_REDIRECT_URI?code=CODIGO_AUTORIZACAO&state=ESTADO`

### 2) Trocar code por tokens
Endpoint:
- `POST https://auth.contaazul.com/oauth2/token`

Headers:
- `Authorization: Basic base64(client_id:client_secret)`
- `Content-Type: application/x-www-form-urlencoded`

Body:
- `grant_type=authorization_code`
- `code=...`
- `redirect_uri=...`

Retorno esperado:
- `access_token`
- `refresh_token`
- `id_token`
- `expires_in`

### 3) Renovar access token
Mesmo endpoint `/oauth2/token` com:
- `grant_type=refresh_token`
- `refresh_token=...`

Prática recomendada:
- refresh automático ao receber 401
- persistir novos tokens
- retry único da requisição original
- fallback para `reauth_required` se refresh falhar

---

## Módulos sugeridos (Elixir)
- `MyApp.Auth.ContaAzulOAuth`
- `MyApp.Connectors.ContaAzul`
- `MyApp.Tools.Finance`
- `MyApp.Tools.CRM`
- `MyApp.Orchestrator`
- `MyApp.Policies`
- `MyApp.Audit`
- `MyApp.Tenancy`
- `MyApp.Telegram`

---

## Modelo de dados mínimo
- `tenants`
- `users`
- `tenant_integrations` (oauth tokens, status)
- `jobs`
- `job_events`
- `tool_calls`
- `approvals`

---

## Checklist de pronto (MVP)
- [ ] OAuth end-to-end funcionando em produção
- [ ] 8 tools MVP funcionando via Telegram
- [ ] Guardrails de confirmação e idempotência ativos
- [ ] Auditoria completa por ação
- [ ] Multi-tenant isolado
- [ ] Refresh token automático com tratamento de erro
- [ ] Logs sem vazamento de segredo

---

## Notas de produto
- Não depender de HAR para cliente final.
- HAR só para troubleshooting interno.
- Base pronta para expandir adapters de outros ERPs (Bling, Omie, Tiny, Nibo) sem reescrever o core.
