# Pre-Production Checklist

## 1. Environment variables
1. Configure CLI/BYO: `IG_META_CLIENT_ID`, `IG_META_CLIENT_SECRET`, `IG_META_REDIRECT_URI`
2. Configure CLI/Central: `IG_CENTRAL_API_URL`, `IG_CENTRAL_CLIENT_ID`
3. Configure Central API deploy env: `PORT`, `HOST`, `IG_CENTRAL_REDIRECT_URI`
4. Validate `.env.example` matches deployed variables.

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
1. Add persistent token storage (DB) replacing in-memory store.
2. Add rate limiting and audit log for publish/auth routes.
3. Add queue/worker for async publish (`BullMQ/Redis`) before high-volume production.

## 6. Database and migrations (when persistent storage is enabled)
1. Apply migrations in staging.
2. Validate rollback path.
3. Run backfill/token integrity checks.
4. Promote same migration set to production.

## 7. Release
1. `pnpm -r build`
2. Publish `ig` package with controlled tag (`next`, then `latest`)
3. Tag release and publish changelog.
