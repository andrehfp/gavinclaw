# PRD — ArgusChat MVP v1 (14 dias)

## Objetivo
Colocar no ar um MVP vendável para agências com o fluxo:
**Chat -> Geração de campanha -> Aprovação por link**

## Escopo do MVP (não negociável)
1. Chat (hub de comando)
2. Geração de campanha por canal (LinkedIn, Instagram, X)
3. Aprovação por link (approve/reject + comentário)
4. Workspaces por cliente
5. Audit log básico
6. Trial + checkout Founder Plan
7. Landing simples com CTA único

## Fora de escopo (fase 2)
- Analytics avançado
- Scheduler nativo completo para todos os canais
- Integrações enterprise (SSO/SCIM)
- Marketplace de agentes

---

## Tasks para executar amanhã (Day 1)

### T1. Definição final de produto e oferta
- [ ] Congelar tagline e proposta de valor
- [ ] Confirmar Founder Plan (R$ 499/mês)
- [ ] Definir limite do plano (ex: até 5 workspaces)

**DoD:** Oferta publicada e sem ambiguidades.

### T2. Estrutura de dados mínima
- [ ] Modelar entidades: workspace, client, campaign, draft, approval, comment, audit_event
- [ ] Definir estados de aprovação: pending, approved, rejected

**DoD:** Schema implementado + migração aplicada.

### T3. Chat como cockpit
- [ ] Criar tela única de chat por workspace
- [ ] Input de briefing + comando “gerar campanha”

**DoD:** Usuário envia briefing e recebe resposta funcional.

### T4. Geração de campanha multi-canal
- [ ] Gerar 3 variações: LinkedIn, Instagram, X
- [ ] Retornar em cards separados

**DoD:** 1 briefing -> 3 drafts prontos para revisão.

### T5. Approval link (core)
- [ ] Botão “Enviar para aprovação”
- [ ] Link público com token seguro
- [ ] Cliente pode aprovar/reprovar e comentar
- [ ] Registrar versão e decisão

**DoD:** Fluxo completo funcionando ponta a ponta.

### T6. Audit log básico
- [ ] Registrar eventos: draft_created, sent_for_approval, approved/rejected, comment_added
- [ ] Mostrar timeline simples por campanha

**DoD:** Qualquer campanha mostra histórico claro.

### T7. Landing + trial + checkout
- [ ] Publicar landing v1 (copy já pronta em `argus/content/landing-v1.md`)
- [ ] CTA para trial 14 dias
- [ ] Checkout com plano Founder ativo

**DoD:** Visitante consegue virar trial e pagante sem call.

### T8. Instrumentação mínima
- [ ] Eventos: landing_view, trial_started, campaign_generated, approval_sent, approval_completed, paid
- [ ] Dashboard simples com funil

**DoD:** Métricas básicas visíveis para decisão.

### T9. QA rápido
- [ ] Testar 3 fluxos reais de agência
- [ ] Corrigir bugs bloqueantes

**DoD:** Zero bug crítico no fluxo principal.

### T10. Go-to-market de amanhã
- [ ] Preparar 20 mensagens de outbound
- [ ] Selecionar lista inicial de 50 agências
- [ ] Disparar primeiras 20 abordagens

**DoD:** Primeiras conversas iniciadas no mesmo dia do deploy.

---

## Priorização (ordem de execução)
1. T2
2. T3
3. T4
4. T5
5. T6
6. T7
7. T8
8. T9
9. T10

---

## Critério de sucesso da sprint (14 dias)
- >= 3 clientes pagantes Founder
- >= 30% dos trials enviam 1 aprovação
- >= 50% dos pagantes ativos na semana 2

## Regra de produto
Se tiver conflito de escopo: priorizar sempre o fluxo **gerar -> aprovar -> registrar**.
