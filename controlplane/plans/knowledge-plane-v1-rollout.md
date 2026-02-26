# Knowledge Plane v1 Rollout Plan (ControlPlane)

## 1) Objetivo
Adicionar ao `controlplane` uma camada de conhecimento inspirada no template `vercel-labs/knowledge-agent-template`, sem trocar stack principal:
- manter `Next.js + WorkOS + Postgres + Convex`;
- habilitar ingestão/sync de fontes (começando por GitHub);
- permitir retrieval confiável por organização (`org_id`) para uso em conversas;
- manter trilha de auditoria e RBAC já existentes.

## 2) Decisões de arquitetura
- Não migrar para Nuxt/Better Auth/NuxtHub.
- Postgres continua sendo source-of-truth para dados de conhecimento e execução de sync.
- Convex continua como projeção realtime para UI operacional (status, runs recentes, etc).
- Retrieval inicial sem embeddings (paridade de filosofia do template), com busca lexical/híbrida:
  - filtros por fonte/tipo/path;
  - ranking por `ts_rank` + sinais de recência.
- Execução de sync via job runner simples (CLI + cron/trigger HTTP autenticado).

## 3) Escopo funcional v1
1. Cadastro de fonte de conhecimento por organização.
2. Sync inicial e incremental (MVP: GitHub repository via API).
3. Indexação textual com chunking simples.
4. Endpoint de busca com RBAC e isolamento multi-tenant.
5. Integração da busca no fluxo de mensagens para contextualização de respostas.
6. UI admin mínima para fontes, runs e saúde do sync.

## 4) Fases de implementação

## Fase 0 - Foundation (1-2 dias)
- Criar pasta e contratos:
  - `lib/server/knowledge/*` para serviços.
  - `app/api/protected/knowledge/*` para endpoints.
  - `scripts/knowledge/*` para jobs.
- Definir tipos comuns em `lib/server/knowledge/types.ts`.
- Publicar ADR curta em `docs/knowledge-plane-adr.md`.

Critério de aceite:
- Estrutura criada e ADR aprovada.

## Fase 1 - Data model + migrações (1-2 dias)
Criar `db/migrations/003_create_knowledge_plane.sql` com:
- `knowledge_sources`
  - `id`, `org_id`, `created_by_user_id`, `type`, `name`, `status`, `config_json`, `sync_cursor_json`, `last_synced_at`, `created_at`, `updated_at`.
- `knowledge_documents`
  - `id`, `source_id`, `org_id`, `external_id`, `title`, `path`, `url`, `content_text`, `content_hash`, `metadata_json`, `first_seen_at`, `last_seen_at`, `created_at`, `updated_at`.
- `knowledge_chunks`
  - `id`, `document_id`, `org_id`, `chunk_index`, `content`, `token_estimate`, `search_vector` (`tsvector`), `metadata_json`, `created_at`.
- `knowledge_sync_runs`
  - `id`, `source_id`, `org_id`, `status`, `started_at`, `finished_at`, `stats_json`, `error_text`.

Índices mínimos:
- por `org_id` em todas as tabelas.
- `knowledge_documents (source_id, external_id)` unique.
- GIN em `knowledge_chunks(search_vector)`.
- `knowledge_sync_runs (source_id, started_at desc)`.

Critério de aceite:
- `bun run db:migrate` aplica clean em ambiente local.

## Fase 2 - Ingestion pipeline (GitHub MVP) (2-4 dias)
Implementar:
- `lib/server/knowledge/connectors/github.ts`
  - listar arquivos elegíveis (md, txt, docs, código opcional por extensão).
  - baixar conteúdo e metadados.
- `lib/server/knowledge/indexer.ts`
  - normalização de texto;
  - chunking por tamanho (ex.: ~1200-1800 chars);
  - update idempotente por `content_hash`.
- `scripts/knowledge/sync.ts`
  - sync por `sourceId` ou por `orgId`.
- endpoint trigger interno:
  - `POST /api/protected/knowledge/sync` (admin).

Auditoria:
- registrar `knowledge.source.create|update|sync.start|sync.finish|sync.fail` via trilha já existente.

Critério de aceite:
- Fonte GitHub sincroniza e popula `documents/chunks` com idempotência.

## Fase 3 - Retrieval API (1-2 dias)
Criar endpoints:
- `POST /api/protected/knowledge/search`
  - input: `query`, `sourceIds?`, `limit?`.
  - output: chunks ranqueados + metadados de origem.
- `GET /api/protected/knowledge/sources`
- `POST /api/protected/knowledge/sources`
- `PATCH /api/protected/knowledge/sources/:id`

Regras:
- isolamento por `org_id` obrigatório em toda query.
- `user` pode buscar e escrever; ações administrativas ficam com `admin`.
- paginação e limites defensivos.

Critério de aceite:
- busca retorna contexto relevante somente da organização do usuário.

## Fase 4 - Integração com conversas (2-3 dias)
- No fluxo `POST /api/protected/conversations/[conversationId]/messages`:
  - ao receber mensagem do usuário, buscar top-N chunks;
  - armazenar referência de contexto usado (`source_id`, `document_id`, `chunk_id`) no payload de auditoria.
- Adicionar resposta de assistente (se o pipeline LLM já estiver disponível no projeto).
  - Se não houver LLM ativo, implementar modo "context preview" primeiro.
- Preparar estrutura para exibir "sources used" na UI de conversa.

Critério de aceite:
- cada mensagem pode consumir contexto de knowledge e registrar evidência auditável.

## Fase 5 - UI operacional (2-3 dias)
- Página/projeção para:
  - listar fontes;
  - criar/editar fonte;
  - executar sync manual;
  - ver últimas execuções e erros.
- Convex pode espelhar status para realtime (opcional no MVP; recomendado para UX).

Critério de aceite:
- time interno consegue operar ciclo completo sem SQL manual.

## Fase 6 - Hardening para produção (2-4 dias)
Segurança e robustez:
- validação estrita de URL/repositório permitido;
- limites de tamanho/quantidade de arquivos por sync;
- timeout/retry/backoff;
- lock de concorrência por `source_id` para evitar runs paralelos;
- redaction opcional para segredos (regex policies).

Confiabilidade:
- reprocessamento seguro por hash;
- métricas de latência, documentos processados, taxa de erro;
- alarmes para run falha consecutiva.

Critério de aceite:
- pipeline estável sob carga e com falhas recuperáveis.

## 5) Mudanças de código esperadas
- Novo migration SQL:
  - `db/migrations/003_create_knowledge_plane.sql`
- Novos serviços:
  - `lib/server/knowledge/connectors/github.ts`
  - `lib/server/knowledge/indexer.ts`
  - `lib/server/knowledge/search.ts`
  - `lib/server/knowledge/service.ts`
- Novos endpoints:
  - `app/api/protected/knowledge/sources/route.ts`
  - `app/api/protected/knowledge/search/route.ts`
  - `app/api/protected/knowledge/sync/route.ts`
- Job CLI:
  - `scripts/knowledge/sync.ts`
- (Opcional) projeção Convex:
  - `convex/knowledge*.ts`
  - ajustes em `convex/schema.ts`

## 6) Environment variables (novo)
Adicionar em `.env.local.example`:
- `GITHUB_TOKEN=` (MVP) ou credenciais GitHub App em fase seguinte.
- `KNOWLEDGE_SYNC_SHARED_SECRET=` (para trigger interno/cron).
- `KNOWLEDGE_SYNC_MAX_FILES=2000`
- `KNOWLEDGE_SYNC_MAX_FILE_BYTES=500000`
- `KNOWLEDGE_SEARCH_DEFAULT_LIMIT=8`

Se houver geração de resposta com LLM na Fase 4:
- `OPENAI_API_KEY=` (ou provider equivalente já adotado no projeto).

## 7) Estratégia de testes
Automação mínima:
- `tests/knowledge/search.test.ts`
  - isolamento por org.
  - ranking básico esperado.
- `tests/knowledge/sync-idempotency.test.ts`
  - re-sync sem duplicar chunks/docs.
- `tests/api/knowledge-rbac.test.ts`
  - `user` com write;
  - `admin` com write + administração.

Smoke manual:
1. criar fonte GitHub;
2. executar sync;
3. buscar termo conhecido;
4. validar citação de source no contexto da conversa;
5. confirmar eventos no audit.

## 8) Plano de rollout
1. Deploy com schema + endpoints atrás de feature flag `knowledge_plane_v1`.
2. Liberar somente para org interna de teste.
3. Rodar sync diário manual por 3-5 dias.
4. Ajustar limites/ranking.
5. Habilitar para 5-10 organizações piloto.
6. GA após estabilidade de erro/latência.

## 9) Riscos principais e mitigação
- Volume de dados alto em Postgres:
  - mitigar com limites por fonte e política de retenção.
- Qualidade de busca sem embeddings:
  - mitigação híbrida: boost de título/path + fallback lexical;
  - planejar v2 com rerank por modelo leve.
- Vazamento cross-tenant:
  - mitigar com testes obrigatórios de isolamento e filtros por `org_id` em toda query.
- Custo operacional do sync:
  - mitigar com incremental por cursor/hash e agenda por prioridade.

## 10) Definition of Done (produção)
- Migrações aplicam sem intervenção manual.
- Sync idempotente e auditável em produção.
- Busca com RBAC e isolamento multi-tenant validada por testes.
- Painel operacional funcional para fontes/runs.
- Alertas e métricas ativos.
- Checklist de release executado (`lint`, `test`, `build`, smoke em ambiente real).

## 11) Ordem recomendada de execução (resumo)
1. Fase 0-1 (foundation + schema).
2. Fase 2 (sync GitHub MVP).
3. Fase 3 (search API).
4. Fase 4 (acoplamento com mensagens).
5. Fase 5 (UI operacional).
6. Fase 6 (hardening + rollout gradual).
