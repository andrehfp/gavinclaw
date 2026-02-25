# Pesquisa de Mercado + PRD MVP
## Produto: ControlPlane AI (Governança de Chat/Agentes IA Enterprise)
## Data: 2026-02-24

---

## 1) Resumo executivo (sem rodeio)

**Veredito:** mercado válido, competitivo e em consolidação.

- Entrar com “mais um chat enterprise” = erro.
- Entrar com **camada neutra de governança operacional de agentes** = oportunidade.
- Melhor wedge para startup: **Human-in-the-loop + auditoria imutável + policy por ação crítica**, cobrindo múltiplos provedores (OpenAI/Anthropic/Azure/local).

**Posicionamento recomendado:**
> “Não substituímos Copilot/Claude/ChatGPT. Governamos o uso deles com segurança, controle de risco e trilha auditável.”

---

## 2) Panorama do mercado

### 2.1 Forças que puxam demanda
1. Adoção já ocorreu. Governança ficou para trás.
2. Compliance (LGPD, SOC2, regulatório setorial) virou impeditivo de escala.
3. Multi-model/multi-vendor é realidade e aumenta risco operacional.
4. Agentes com tool execution elevam risco de impacto real (não só texto).

### 2.2 Tendência
O mercado está migrando de “prompt governance” para **agent governance** (controle de ações, aprovações, trilha de decisão e blast radius).

---

## 3) Mapa de concorrência

## 3.1 Categorias

1. **Chat suites enterprise (vendor lock-in)**
- Ex: Microsoft 365 Copilot, ChatGPT Enterprise, Claude Enterprise
- Forte em produtividade, segurança básica e admin controls
- Fraco em neutralidade cross-provider e governança unificada de agentes externos

2. **AI gateway + observability + guardrails (dev/platf.)**
- Ex: Portkey, Helicone, LangSmith, Braintrust, Langfuse
- Forte em tracing, roteamento, eval e monitoramento
- Fraco em processo de compliance corporativo e aprovação operacional de ações

3. **AI security runtime**
- Ex: Lakera, Protect AI, Zenity
- Forte em proteção contra prompt injection, jailbreak, data leakage
- Fraco em governança de negócio (workflows de aprovação, ownership, accountability)

4. **AI governance/GRC platforms**
- Ex: Credo AI, IBM stack de governança
- Forte em inventário, políticas, frameworks e compliance
- Fraco em time-to-value para empresas menores e operação no nível de execução diária

---

## 3.2 Tabela rápida (posicionamento)

| Player | Força principal | Gap explorável por você |
|---|---|---|
| Microsoft Copilot | Nativo M365 + segurança enterprise | Lock-in e baixa neutralidade multi-stack |
| ChatGPT Enterprise | UX e adoção | Governança operacional por ação específica |
| Claude Enterprise | Forte em produtividade + AI adoption | Ainda não resolve orquestração neutra multi-vendor em todo ecossistema |
| Portkey | Gateway/observability/guardrails | Menor foco em workflow formal de compliance/HITL por processo |
| Helicone | Gateway + observability (dev-first) | Menor densidade de governança corporativa |
| Lakera | Runtime security | Não é sistema de governança organizacional completo |
| Protect AI | AI security ampla | Menor foco em experiência de operação diária para áreas de negócio |
| Credo AI | Governança/GRC robusta | Complexidade e ciclo de adoção pesado para mid-market |

---

## 4) Lacunas reais (onde dá para ganhar)

1. **Governança no nível da ação do agente**
- Não só “prompt permitido”, mas: “essa ação pode executar? quem aprova? qual justificativa?”

2. **Camada neutra multi-vendor**
- Política única para OpenAI, Anthropic, Azure, modelos locais e agentes internos.

3. **Time-to-value de 45 dias (piloto)**
- Competidores enterprise costumam ser longos e caros.

4. **Mid-market enterprise (200-2.000 funcionários)**
- Grande demais para “fazer na mão”, pequeno demais para implantações pesadas de 6-12 meses.

---

## 5) Estratégia de venda (como fechar)

## 5.1 ICP prioritário
- Empresas com uso real de IA já em produção interna
- Segmentos: financeiro, health, educação, BPO, software B2B com compliance
- Sponsor duplo: **Head de Segurança/GRC + Head de Operações/TI**

## 5.2 Oferta comercial

### Produto inicial
- **Piloto 45 dias** com 1 caso crítico (ex: atendimento interno, jurídico, compras)
- Entrega concreta:
  - policy ativa
  - aprovação humana para ações críticas
  - trilha auditável exportável
  - dashboard de custo e risco

### Preço recomendado
- Setup: R$20k a R$60k
- Mensalidade: R$8k a R$40k

## 5.3 Playbook de vendas
1. Discovery de risco (30-45 min)
2. Mapeamento de 3 processos críticos
3. PoV técnico rápido (7-10 dias)
4. Piloto 45 dias com KPI fechado
5. Contrato anual + expansão por área

## 5.4 Objeções e resposta
- “Já temos Copilot/Claude.”
  - Resposta: “Perfeito. Nós governamos o uso deles com política única e auditoria.”
- “Vai adicionar fricção.”
  - Resposta: “Apenas em ações de alto risco; resto segue fluido.”
- “Segurança já cuida disso.”
  - Resposta: “Ferramentas atuais cobrem segurança técnica, não accountability operacional ponta a ponta.”

---

## 6) Estratégia de marketing (B2B enterprise)

## 6.1 Mensagem central
**“Do chat productivity to agent accountability.”**

## 6.2 Canais
1. Founder-led outbound (LinkedIn + e-mail curto + intro quente)
2. Conteúdo de autoridade (framework de risco de agentes)
3. Webinars co-host com parceiro de compliance
4. Casos de uso setoriais (financeiro, saúde, educação)
5. Community de CISO/GRC/IT ops

## 6.3 Ativos que precisam existir
- Landing enterprise (problema, risco, arquitetura, CTA para piloto)
- One-pager PDF (before/after)
- Security & compliance brief
- ROI calculator (incidente evitado + tempo de auditoria + custo de IA)
- Demo script de 10 min

## 6.4 Funil sugerido
- MQL: baixou framework/checklist
- SQL: call de risco com sponsor técnico
- PoV: cenário real rodando
- Piloto pago: 45 dias
- Upsell: mais áreas + mais agentes + conectores

---

## 7) PRD — MVP (8 semanas)

## 7.1 Problema
Empresas usam IA sem controle uniforme. Falta governança operacional para agentes e ações de risco.

## 7.2 Objetivo do MVP
Validar que um gateway de governança com HITL e auditoria reduz risco percebido e destrava adoção.

## 7.3 Hipóteses
1. Times de segurança pagam por controle de ações críticas de agentes.
2. Piloto com 1 processo crítico já gera valor mensurável.
3. Multi-vendor neutral é diferencial de compra.

## 7.4 Escopo (MVP)

### Must-have
- SSO (OIDC/SAML) + RBAC
- Endpoint unificado de inferência (gateway)
- Policy engine pré/pós resposta (mask/block/warn)
- Quotas/budget por time/projeto
- Fila de aprovação humana para ações críticas
- Audit log append-only com export
- Dashboard básico (uso, custo, bloqueios, aprovações)

### Out of scope
- Marketplace de agentes
- Auto-remediação complexa
- ABAC documental avançado
- Analytics preditivo sofisticado

## 7.5 Requisitos funcionais
1. Usuário autenticado envia request ao gateway
2. Policy engine inspeciona/mascara/bloqueia
3. Roteador escolhe provider/modelo
4. Se houver ação crítica, abre aprovação
5. Execução somente após approve
6. Tudo vai para trilha de auditoria

## 7.6 Requisitos não funcionais
- Multi-tenant isolado
- Criptografia at-rest/in-transit
- p95 de overhead do gateway < 300ms
- disponibilidade alvo 99.5%
- retenção configurável de logs

## 7.7 Arquitetura mínima
- Front: Next.js + Vercel AI SDK
- Backend/Gateway: FastAPI
- Queue: Redis
- DB transacional: Postgres
- Audit store: Postgres append-only (v1)
- Observability: OpenTelemetry + dashboard simples

## 7.8 Backlog por sprint

### Sprint 1-2
- Auth, tenants, RBAC
- endpoint gateway v1
- logging base

### Sprint 3-4
- policy engine v1 (PII + regras sensíveis)
- quotas e budget
- dashboard básico

### Sprint 5-6
- HITL para ações críticas
- audit log encadeado (checksum)
- export de auditoria

### Sprint 7-8
- hardening
- piloto com 1 cliente
- ajustes UX/policy

## 7.9 Critérios de aceitação
- 100% das requests passam por policy engine
- ações críticas não executam sem aprovação
- trilha auditável exportável funcionando
- dashboard mostra custo e eventos de risco por projeto
- SLO de latência respeitado em carga de piloto

## 7.10 KPIs do piloto
- % requests com policy aplicada
- número de bloqueios relevantes
- tempo médio de aprovação crítica
- redução de incidentes reportados
- previsibilidade de custo por área

---

## 8) Riscos e mitigação

1. **Ciclo enterprise longo**
- Mitigar com piloto pago e escopo fechado

2. **Concorrência de suites grandes**
- Mitigar com posicionamento de camada neutra e agent accountability

3. **Fricção por excesso de bloqueio**
- Mitigar com modo warn-only inicial + tuning gradual

4. **Integração complexa**
- Mitigar com pacote inicial de 2-3 conectores mais comuns

---

## 9) Decisão recomendada

**Go**, com foco em:
1. mid-market enterprise
2. caso de uso de alto risco
3. piloto de 45 dias
4. diferenciação: HITL + auditoria imutável + multi-vendor

Não entrar como “chat enterprise alternativo”. Entrar como **control plane de governança operacional para agentes**.

---

## Fontes (pesquisa web)
- https://www.credo.ai
- https://zenity.io
- https://protectai.com
- https://www.lakera.ai
- https://portkey.ai
- https://portkey.ai/pricing
- https://www.helicone.ai/pricing
- https://www.langchain.com/pricing
- https://www.braintrust.dev/pricing
- https://www.promptfoo.dev/pricing/
- https://openai.com/enterprise-privacy/
- https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-privacy
