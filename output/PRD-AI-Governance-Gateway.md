# PRD — AI Governance Gateway (Enterprise)

## 1) Resumo executivo
Construir uma plataforma B2B para empresas que querem usar chat/agentes de IA com controle corporativo real.

**Tese:** não vender “chat com IA”. Vender **governança, segurança e auditoria** para uso de IA em escala.

**Stack proposta:** Vercel AI SDK para camada de produto (UX/streaming/tools) + Gateway próprio para políticas, roteamento, compliance e observabilidade.

---

## 2) Problema
Empresas grandes já estão adotando IA, mas com risco operacional:
- uso sem política (cada área usa do seu jeito)
- risco de vazamento de dados sensíveis
- ausência de trilha de auditoria confiável
- custo fora de controle
- agentes executando ações sem aprovação formal

Resultado: jurídico e segurança travam adoção, mesmo com demanda interna alta.

---

## 3) Objetivo do produto
Permitir uso de IA corporativa com:
1. **Controle** (RBAC, políticas por time/risco)
2. **Proteção** (DLP, masking de PII, guardrails)
3. **Governança** (auditoria imutável + console)
4. **Eficiência** (roteamento por custo/latência/modelo)

### Metas de negócio (12 meses)
- 5 pilotos pagos enterprise
- 3 clientes com renovação anual
- ticket médio mensal: R$12k+ por conta

---

## 4) Escopo

### In Scope (MVP)
- SSO (OIDC/SAML) + RBAC por papel
- AI Gateway com roteamento para múltiplos providers
- Policy engine (pré e pós resposta)
- DLP básico (CPF, e-mail, telefone, cartão) + masking
- Quotas e budget por time
- Logs imutáveis de auditoria
- Dashboard de governança (custo, uso, incidentes)
- Aprovação humana para ações críticas de agentes

### Out of Scope (MVP)
- marketplace público de agentes
- no-code builder completo de fluxos complexos
- policy engine avançado com DSL completa
- detecção antifraude comportamental avançada

---

## 5) Personas

### 5.1 Head de Segurança / GRC
- Quer impedir vazamento e ter rastreabilidade total
- Compra quando vê controle + auditoria + política aplicável

### 5.2 Head de TI / Plataforma
- Quer padronizar uso de IA sem travar o negócio
- Compra quando integração é simples e governável

### 5.3 Líder de Operações / Atendimento
- Quer automação com menos retrabalho e risco
- Compra quando há aprovação humana em ações críticas

---

## 6) Proposta de valor
"Use IA com velocidade de produto sem abrir mão de segurança e compliance."

- Time de negócio ganha produtividade
- Segurança ganha controle
- Jurídico ganha trilha de auditoria
- FinOps ganha previsibilidade de custo

---

## 7) Requisitos funcionais

### RF-01 — Autenticação e autorização
- Login via SSO (OIDC/SAML)
- RBAC por perfil (admin, security, operator, viewer)
- Scoping por tenant, BU, projeto

### RF-02 — AI Gateway
- Endpoint unificado de inference para chat/agentes
- Roteamento por política (custo, latência, risco)
- Failover entre providers

### RF-03 — Policy Engine
- Regras de bloqueio por padrão sensível
- Máscara de PII no prompt e na resposta
- Regras por contexto (área/departamento)

### RF-04 — RAG com ACL
- Integração com fontes corporativas (faseada)
- Filtragem de contexto por permissão do usuário

### RF-05 — Aprovação humana (HITL)
- Ações críticas entram em fila de aprovação
- Aprovar/rejeitar com justificativa
- SLA de aprovação e trilha completa

### RF-06 — Auditoria e observabilidade
- Log de cada requisição/resposta/política aplicada
- Dashboard de custo, latência, taxa de bloqueio
- Export de relatório para compliance

### RF-07 — FinOps de IA
- Budget por equipe/projeto
- Alertas de estouro
- Relatórios de consumo por provider/modelo

---

## 8) Requisitos não funcionais
- Multi-tenant isolado por conta
- Criptografia em trânsito e em repouso
- Idempotência em ações de agente
- P95 de latência adicional do gateway < 300ms
- Disponibilidade alvo MVP: 99.5%
- Retenção de auditoria configurável (90/180/365 dias)

---

## 9) Arquitetura (alto nível)
1. **Client Layer**: Web Chat / Slack / Teams / API
2. **Identity Layer**: SSO + RBAC
3. **AI Gateway**: roteamento + quotas + políticas
4. **Policy Engine**: DLP/masking/guardrails
5. **RAG Layer**: retrieval com ACL
6. **Model Router**: OpenAI/Anthropic/Azure/local
7. **Agent Runtime**: tools + sandbox + HITL
8. **Governance Layer**: observability + audit log + console

---

## 10) UX mínima (MVP)

### 10.1 Tela de Chat Enterprise
- histórico, streaming, fonte usada, aviso de política aplicada

### 10.2 Painel de Aprovação
- lista de ações pendentes
- contexto da ação e impacto
- botões Aprovar/Rejeitar

### 10.3 Console de Governança
- uso por time
- custo por modelo
- eventos bloqueados por política
- export de auditoria

---

## 11) Métricas de sucesso

### Produto
- % requisições cobertas por política
- tempo médio de aprovação HITL
- redução de incidentes de dados sensíveis

### Negócio
- tempo de fechamento do piloto
- conversão piloto -> contrato anual
- expansão de assentos por cliente

### Técnica
- P95 latência gateway
- taxa de erro por provider
- acurácia de detecção de PII (precision/recall operacional)

---

## 12) Plano de entrega (60 dias)

### Fase 1 (Semanas 1-2)
- Auth (SSO) + RBAC
- Endpoint unificado do gateway
- Logs base

### Fase 2 (Semanas 3-4)
- Policy Engine v1 (bloqueio/masking)
- Budgets/quotas
- Dashboard básico de uso/custo

### Fase 3 (Semanas 5-6)
- HITL para ações críticas
- Audit log imutável
- Export de relatórios

### Fase 4 (Semanas 7-8)
- Hardening
- piloto com 1 cliente
- ajustes de policy + UX

---

## 13) Go-to-market inicial

### ICP
Empresas de 200 a 2.000 funcionários com uso ativo de IA e pressão de compliance.

### Oferta
- Setup inicial: R$20k-R$60k
- Mensalidade: R$8k-R$40k
- Variável por volume e integrações

### Estratégia
- vender piloto de 45 dias com escopo fechado
- foco em 1 caso de uso crítico (ex: atendimento interno, jurídico, operações)
- prova de valor: redução de risco + visibilidade + governança

---

## 14) Riscos e mitigação

1. **Ciclo enterprise longo**
- Mitigação: piloto curto com KPI e escopo fechado

2. **Integrações corporativas complexas**
- Mitigação: conectores faseados + foco em 1-2 fontes no piloto

3. **Falso positivo em políticas**
- Mitigação: modo “warn-only” inicial + tuning progressivo

4. **Custo de inferência alto**
- Mitigação: roteamento por custo e hard caps por time

---

## 15) Critério de Go/No-Go após piloto
- Go se:
  - 1 caso crítico em produção controlada
  - auditoria aprovada por segurança/jurídico
  - redução de risco/custo percebida pelo cliente
- No-Go se:
  - fricção operacional inviabiliza adoção
  - políticas geram bloqueio excessivo sem ganho

---

## 16) Nome de trabalho
- **ControlPlane AI**
- Alternativas: **GovAgent**, **PolicyMesh AI**, **Aegis AI Gateway**
