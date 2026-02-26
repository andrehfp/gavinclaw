# ControlPlane AI Foundation v1

Base implementation of the v1 foundation using:

- Next.js App Router
- WorkOS AuthKit (authentication + organizations)
- Postgres (source-of-truth for tenancy/policies/approvals/audit)
- Convex (realtime chat projection + backend)

## What is implemented

- WorkOS authentication flow (`/sign-in`, `/sign-up`, `/callback`)
- Postgres domain model for compliance/core governance:
  - `organizations`, `users`, `memberships`
  - `policy_rules`, `approval_requests`, `approval_decisions`
  - `audit_events` append-only hash-chain
- Convex used as realtime projection for conversations/messages and UI state
- RBAC roles: `admin | user` (managed in WorkOS claims, mirrored to Postgres/Convex memberships)
- Protected API endpoints with RBAC checks and audit logging:
  - `GET /api/protected/context`
  - `GET /api/protected/conversations`
  - `POST /api/protected/conversations`
  - `POST /api/protected/conversations/:conversationId/messages`
  - `POST /api/protected/conversations/:conversationId/stream` (AI SDK streaming + tools)
- Postgres append-only audit table + hash-chain trigger
- Migration runner, seed script, and basic authorization tests

## UI stack (shadcn/ui)

shadcn/ui is configured for this project (Next.js + Tailwind v4):

- `components.json` created with aliases (`@/components`, `@/components/ui`, `@/lib/utils`)
- Tokens and theme variables wired in `app/globals.css`
- Shared `cn()` helper at `lib/utils.ts`
- Starter components added under `components/ui/`:
  - `avatar`, `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `scroll-area`, `separator`, `textarea`

To add more components:

```bash
bunx --bun shadcn@latest add <component-name>
```

## Environment variables

Copy `.env.local.example` to `.env.local` and set:

- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (usually `http://localhost:3000/callback`)
- `WORKOS_ADMIN_ROLE_SLUG` (optional role slug override, e.g. `owner`)
- `WORKOS_USER_ROLE_SLUG` (optional role slug override, e.g. `member`)
- `VERCEL_PROJECT_PRODUCTION_URL` (required for `convex deploy` auth auto-provisioning)
- `NEXT_PUBLIC_CONVEX_URL`
- `DATABASE_URL`
- `OPENROUTER_API_KEY` (required for OpenRouter models)
- `OPENROUTER_BASE_URL` (optional, default `https://openrouter.ai/api/v1`)
- `OPENROUTER_HTTP_REFERER` (optional but recommended for OpenRouter analytics)
- `OPENROUTER_APP_NAME` (optional but recommended for OpenRouter analytics)
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY` (required for Anthropic models)
- `GOOGLE_GENERATIVE_AI_API_KEY` (required for Google models)
- `AI_CHAT_MODEL` (optional, default `openrouter:openai/gpt-4.1-mini`)
- `AI_CHAT_RATE_LIMIT_WINDOW_MINUTES` (optional, default `60`)
- `AI_CHAT_MAX_USER_MESSAGES_PER_WINDOW` (optional, default `40`)
- `AI_ARTIFACTS_V1_ENABLED` (optional, default `true`; set `false` to disable artifact tools)

## Local setup

1. Install dependencies:

```bash
bun install
```

2. Configure WorkOS:

- Add `http://localhost:3000/callback` as redirect URI in WorkOS
- Ensure your AuthKit app is configured to issue organization-aware sessions

3. Configure Convex deployment:

```bash
bunx convex dev
bunx convex auth add workos
```

4. Run database migrations:

```bash
bun run db:migrate
```

5. Seed foundation data (optional but useful for local QA):

```bash
bun run seed
```

6. Start app + Convex:

```bash
bun run dev
```

7. Run tests:

```bash
bun run test
```

## Audit events in Postgres

Table: `audit_events`

Columns:

- `id`, `ts`, `org_id`, `actor_id`, `action`, `resource`, `payload_json`, `hash`, `prev_hash`

Properties:

- Append-only (updates/deletes are blocked by trigger)
- Hash chain (`hash` includes `prev_hash`) for tamper-evidence

## Pre-production checklist

1. Set all production environment variables in your deploy platform:

- `WORKOS_CLIENT_ID`
- `WORKOS_API_KEY`
- `WORKOS_COOKIE_PASSWORD`
- `NEXT_PUBLIC_WORKOS_REDIRECT_URI` (production callback URL)
- `WORKOS_ADMIN_ROLE_SLUG` (optional)
- `WORKOS_USER_ROLE_SLUG` (optional)
- `VERCEL_PROJECT_PRODUCTION_URL` (your production domain, e.g. `my-app.vercel.app`)
- `NEXT_PUBLIC_CONVEX_URL`
- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_HTTP_REFERER`
- `OPENROUTER_APP_NAME`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `AI_CHAT_MODEL`
- `AI_CHAT_RATE_LIMIT_WINDOW_MINUTES`
- `AI_CHAT_MAX_USER_MESSAGES_PER_WINDOW`
- `AI_ARTIFACTS_V1_ENABLED`

2. Run migrations against production Postgres:

```bash
bun run db:migrate
```

3. Deploy Convex schema/functions after pulling latest code (artifact tables/functions are additive there):

```bash
bunx convex deploy
```

4. Validate WorkOS production redirect URI, organization mapping, and role claims (`role` or `roles`) for all users.

5. Verify RBAC with real users:

- `user` allowed for conversation/message/artifact/project creation
- `admin` can do everything `user` can, plus administrative actions (membership/role management)

6. Verify mirrored audit writes:

- Convex `auditEvents`
- Postgres `audit_events`

7. Run quality gates before deploy:

```bash
bun run lint
bun run test
bun run build
```
