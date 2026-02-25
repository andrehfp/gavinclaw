# Architecture

Monorepo managed by `pnpm` + `turbo`.

## Packages
- `packages/ig-cli`: CLI binary `ig` implemented with `commander`
- `packages/ig-core`: shared contracts, provider interfaces, storage, errors, output format
- `packages/provider-meta-byo`: direct Meta Graph API provider (BYO App)
- `packages/provider-central`: provider that calls `apps/central-api`

## Apps
- `apps/central-api`: Fastify scaffold with auth/session/publish/media/comments endpoints
- `apps/landing`: minimal frontend that starts Facebook login via central-api

## Tooling Contract
Every command supports:
- `--json`: strict JSON output
- `--quiet`: disables human logs
- `--dry-run`: validates and returns behavior without executing network mutations

Success payload:

```json
{
  "ok": true,
  "action": "publish.photo",
  "data": { "media_id": "...", "status": "published" }
}
```

Error payload:

```json
{
  "ok": false,
  "error": { "code": "AUTH_REQUIRED", "message": "..." }
}
```
