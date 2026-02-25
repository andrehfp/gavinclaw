# Pre-Production Checklist

## 1. Environment variables
1. Configure CLI/BYO: `IG_META_CLIENT_ID`, `IG_META_CLIENT_SECRET`, `IG_META_REDIRECT_URI`
2. For higher volume accounts, tune Meta guardrails: `IG_META_MIN_REQUEST_INTERVAL_MS`, `IG_META_GET_RETRY_MAX`, `IG_META_GET_CACHE_TTL_MS`, `IG_META_GET_CACHE_MAX_ENTRIES`, `IG_META_RETRY_BASE_DELAY_MS`, `IG_META_RETRY_MAX_DELAY_MS`
3. Configure CLI/Central: `IG_CENTRAL_API_URL`, `IG_CENTRAL_CLIENT_ID`
4. Configure Central API deploy env: `PORT`, `HOST`, `IG_CENTRAL_REDIRECT_URI`, `IG_CENTRAL_CLIENT_ID`, `IG_CENTRAL_CLIENT_SECRET`, `IG_CENTRAL_OAUTH_PROVIDER` (`facebook` by default), `IG_CENTRAL_SIGNING_SECRET`
   - Optional overrides: `IG_CENTRAL_OAUTH_AUTHORIZE_URL`, `IG_CENTRAL_OAUTH_TOKEN_URL`, `IG_CENTRAL_OAUTH_PROFILE_URL`, `IG_CENTRAL_OAUTH_SCOPE`
   - Bootstrap code hardening: `IG_CENTRAL_BOOTSTRAP_TTL_MS`, `IG_CENTRAL_BOOTSTRAP_MAX_CODES`
5. Validate `.env.example` matches deployed variables.
6. Configure landing deploy env: `LANDING_API_BASE_URL` pointing to public central-api domain.

### Meta guardrail presets
Choose one preset and set it in your deployment environment.

Low volume (single account, low automation):
```bash
IG_META_MIN_REQUEST_INTERVAL_MS=0
IG_META_GET_RETRY_MAX=2
IG_META_GET_CACHE_TTL_MS=3000
IG_META_GET_CACHE_MAX_ENTRIES=200
IG_META_RETRY_BASE_DELAY_MS=750
IG_META_RETRY_MAX_DELAY_MS=20000
```

Medium volume (multiple daily runs, analytics + comments):
```bash
IG_META_MIN_REQUEST_INTERVAL_MS=75
IG_META_GET_RETRY_MAX=2
IG_META_GET_CACHE_TTL_MS=3000
IG_META_GET_CACHE_MAX_ENTRIES=400
IG_META_RETRY_BASE_DELAY_MS=1000
IG_META_RETRY_MAX_DELAY_MS=30000
```

High volume (continuous automation, multiple accounts):
```bash
IG_META_MIN_REQUEST_INTERVAL_MS=150
IG_META_GET_RETRY_MAX=3
IG_META_GET_CACHE_TTL_MS=5000
IG_META_GET_CACHE_MAX_ENTRIES=800
IG_META_RETRY_BASE_DELAY_MS=1500
IG_META_RETRY_MAX_DELAY_MS=45000
```

## 2. Type safety and CI parity
1. Run canonical command: `pnpm typecheck`
2. Confirm CI runs the exact same command before build/deploy.
3. Block deploy on typecheck failures.

## 3. Tests and build gates
1. `pnpm lint`
2. `pnpm test`
3. `pnpm build`
4. Smoke test agent contract:
   - `ig media list --json --quiet --dry-run`
   - `ig publish photo --file https://example.com/a.jpg --json --quiet --dry-run`

## 4. Security checks
1. Confirm auth tokens are not logged in stdout/stderr.
2. Confirm OAuth state/PKCE validation is enabled.
3. Confirm redirect URIs are restricted to approved values.

## 5. Central API operational readiness
1. Set `IG_CENTRAL_SIGNING_SECRET` (32+ chars) consistently across all API instances.
2. Set `IG_CENTRAL_RATE_LIMIT_FILE` to a shared durable path for multi-process deployments (or replace with Redis).
3. Add audit log for publish/auth routes.
4. Add queue/worker for async publish (`BullMQ/Redis`) before high-volume production.

## 6. Database and migrations (when persistent storage is enabled)
1. Apply migrations in staging.
2. Validate rollback path.
3. Run backfill/token integrity checks.
4. Promote same migration set to production.

Current repository status:
1. No database migrations are required for this Meta API optimization rollout.
2. This change is runtime/config only (`provider-meta-byo` request handling + env tuning).

## 7. Release
1. `pnpm -r build`
2. Publish `ig` package with controlled tag (`next`, then `latest`)
3. Tag release and publish changelog.

## 8. Final pre-push sequence
1. Update production env vars with one Meta guardrail preset.
2. Run `pnpm typecheck && pnpm lint && pnpm build`.
3. Run targeted tests:
   - `pnpm --filter @instacli/provider-meta-byo test`
   - `pnpm --filter instacli exec vitest run test/insights.test.ts`
   - `pnpm --filter instacli exec vitest run test/analytics-top-posts.test.ts`
4. Smoke-test with real auth/account in staging:
   - `ig media list --limit 5 --json --quiet`
   - `ig insights account --period week --json --quiet`
5. Monitor logs for:
   - `"Meta API usage high; slowing request pace."`
   - Any repeated `429`/`5xx` provider errors
6. If `429` still appears frequently, increase:
   - `IG_META_MIN_REQUEST_INTERVAL_MS` by +50ms
   - `IG_META_RETRY_BASE_DELAY_MS` by +500ms
7. Push and deploy after staging is stable.
