# instagram-agent-cli

Monorepo `pnpm` + `turbo` for an agent-friendly Instagram CLI.

## Workspace
- `packages/ig-cli`: CLI binary `ig`
- `packages/ig-core`: shared types/contracts/utils
- `packages/provider-meta-byo`: direct Meta Graph API provider
- `packages/provider-central`: provider for central backend
- `apps/central-api`: minimal Fastify backend scaffold

## Setup
```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## Onboarding (Meta BYO)

First-run behavior:
- If no Meta config exists yet, running `ig` (without subcommand) starts guided onboarding automatically in terminal.
- You can run explicitly: `ig onboarding`.
- Use `ig onboarding --no-start` to only print checklist/links.

Useful links:
- Meta App Dashboard: https://developers.facebook.com/apps
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Instagram Graph API docs: https://developers.facebook.com/docs/instagram-platform
- Facebook Login setup: https://developers.facebook.com/docs/facebook-login

### Fast path (guided)
```bash
pnpm build
node packages/ig-cli/dist/bin.js onboarding --open-links
node packages/ig-cli/dist/bin.js setup meta-token
node packages/ig-cli/dist/bin.js auth status --json --quiet
```

### Token-first setup (recommended)
```bash
node packages/ig-cli/dist/bin.js setup meta-token \
  --ig-account-id YOUR_IG_ACCOUNT_ID \
  --page-access-token YOUR_PAGE_ACCESS_TOKEN \
  --ig-username YOUR_IG_USERNAME \
  --json --quiet
```

No redirect URI is required for this path.
Get these values via Graph API Explorer and page/IG lookup flow in `docs/meta-byo-setup.md`.

### Step-by-step onboarding (copy/paste)
1. Get a **User Access Token** in Graph API Explorer with scopes:
`instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`.

2. Auto-discover pages + IG accounts and pick one:
```bash
node packages/ig-cli/dist/bin.js setup meta-token --discover-pages --user-access-token YOUR_USER_ACCESS_TOKEN
```
Behavior:
- If exactly one valid page is found, it is selected automatically.
- If multiple pages are found, pass `--page-id <PAGE_ID>` (CLI now returns suggested commands).

3. Verify:
```bash
ig auth status --json --quiet
ig media list --limit 5 --json --quiet
```

4. If you prefer manual values:
```bash
# list pages and page tokens
curl -s "https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=YOUR_USER_ACCESS_TOKEN" | jq .

# for a specific page id, get IG account id
curl -s "https://graph.facebook.com/v20.0/PAGE_ID?fields=instagram_business_account{id,username}&access_token=PAGE_ACCESS_TOKEN" | jq .
```
Then:
```bash
ig setup meta-token \
  --ig-account-id IG_ACCOUNT_ID \
  --page-access-token PAGE_ACCESS_TOKEN \
  --ig-username IG_USERNAME
```

Common mistakes:
- `APP_ID` is not `IG_ACCOUNT_ID`.
- `PAGE_ID` is not `IG_ACCOUNT_ID`.
- Placeholder values like `SEU_PAGE_ACCESS_TOKEN...` will fail with OAuth error `code 190`.

### CI/non-interactive setup
```bash
node packages/ig-cli/dist/bin.js setup meta-byo \
  --client-id YOUR_APP_ID \
  --client-secret YOUR_APP_SECRET \
  --redirect-uri http://localhost:8788/callback \
  --json --quiet
```

### Where each value comes from
| Variable | Where to find in Meta |
| --- | --- |
| `IG_META_CLIENT_ID` | App Dashboard -> `Settings` -> `Basic` -> `App ID` |
| `IG_META_CLIENT_SECRET` | App Dashboard -> `Settings` -> `Basic` -> `App Secret` |
| `IG_META_REDIRECT_URI` | `Facebook Login` -> `Settings` -> `Valid OAuth Redirect URIs` |

Optional rate-limit guardrails (provider-meta-byo):
- `IG_META_MIN_REQUEST_INTERVAL_MS` (default `0`)
- `IG_META_GET_RETRY_MAX` (default `2`, GET-only)
- `IG_META_GET_CACHE_TTL_MS` (default `3000`)
- `IG_META_GET_CACHE_MAX_ENTRIES` (default `200`)
- `IG_META_RETRY_BASE_DELAY_MS` (default `750`)
- `IG_META_RETRY_MAX_DELAY_MS` (default `20000`)

Use this redirect URI exactly:
`http://localhost:8788/callback`

Full guide: `docs/meta-byo-setup.md`.
Agent runbook: `docs/agent-playbook.md`.

## Canonical pre-push check
```bash
pnpm typecheck
```

## Testing

### 1. Workspace sanity
```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

### 2. CLI contract smoke tests (`--json --quiet --dry-run`)
```bash
IG="node packages/ig-cli/dist/bin.js"

$IG config set provider meta-byo --json --quiet
$IG auth status --json --quiet --dry-run
$IG media list --json --quiet --dry-run
$IG publish photo --file https://example.com/a.jpg --caption "hello" --json --quiet --dry-run
$IG publish video --file https://example.com/a.mp4 --caption "hello" --json --quiet --dry-run
$IG publish carousel --files https://example.com/a.jpg https://example.com/b.jpg --caption "hello" --json --quiet --dry-run
$IG comments list --media 123 --json --quiet --dry-run
$IG comments reply --comment 456 --text "thanks!" --json --quiet --dry-run
```

### 3. Central API scaffold integration
Terminal 1:
```bash
pnpm --filter @instacli/central-api dev
```

Terminal 2:
```bash
curl -s http://127.0.0.1:8787/health
START=$(curl -s -X POST http://127.0.0.1:8787/oauth/start)
STATE=$(echo "$START" | jq -r '.state')
# Use a real authorization code from your configured OAuth provider:
TOKEN=$(curl -s -X POST http://127.0.0.1:8787/oauth/callback \
  -H "content-type: application/json" \
  -d "{\"code\":\"<oauth-code>\",\"state\":\"$STATE\"}" | jq -r '.session_token')

curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8787/session
curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8787/media/list?limit=2"
curl -s -X POST http://127.0.0.1:8787/publish/photo \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"file":"https://example.com/a.jpg","caption":"test"}'
```

Note:
- `central` auth now validates OAuth codes against the configured token endpoint.
- Real end-to-end publish/auth is via `meta-byo` with real Meta env vars and redirect configuration.

## Agent mode contract
Always prefer:
```bash
ig <command> --json --quiet
```

Auth policy for agents:
- Setup is one-time. Do not run `ig setup meta-token` in every cron/job.
- Before posting, run `ig auth status --json --quiet`.
- If auth is valid, post directly.
- Only run setup/login when auth fails (`AUTH_REQUIRED`, invalid token, or account mismatch).

Pagination safety:
- `ig media list` never returns raw `access_token` in output.
- Use `data.next_cursor` for pagination. `data.next` is sanitized when present.

## Multi-account (Meta BYO)

Named accounts are now supported for safer publishing.

### Manage accounts
```bash
ig accounts add --name pessoal --ig-account-id <id> --page-access-token <token> --ig-username andrefprado
ig accounts add --name maia --ig-account-id <id> --page-access-token <token> --ig-username studio.maia.arch
ig accounts list --json --quiet
ig accounts show --name pessoal --json --quiet
ig accounts use pessoal --json --quiet
```

### Use `--account` on commands
```bash
ig media list --account pessoal --limit 10 --json --quiet
ig comments list --account maia --media <id> --json --quiet
ig comments inbox --account pessoal --days 7 --limit 20 --json --quiet
ig insights account --account pessoal --period week --json --quiet
ig analytics top-posts --account maia --days 30 --limit 10 --json --quiet
ig analytics summary --account pessoal --days 7 --json --quiet
```

### Publish safety guardrails
```bash
ig publish photo --account pessoal --file https://example.com/a.jpg --caption "..." --confirm-account @andrefprado --json --quiet
```
- `--confirm-account` blocks publish if configured username does not match.
- If `--account` is omitted, CLI uses default account (`ig accounts use <name>`).

## Agent operations runbook

### 1) Daily inbox triage
```bash
ig comments inbox --account pessoal --days 7 --limit 20 --json --quiet
```

### 2) AI suggestions before replying
```bash
ig comments reply --account pessoal --ai --text "<comment text>" --json --quiet
```

### 3) Publish a chosen reply
```bash
ig comments reply --account pessoal --comment <comment_id> --text "<final reply>" --json --quiet
```
Or one-shot with AI mode:
```bash
ig comments reply --account pessoal --comment <comment_id> --text "<final reply>" --ai --publish --json --quiet
```

### 4) Weekly/monthly snapshot
```bash
ig analytics summary --account pessoal --days 7 --json --quiet
ig analytics summary --account pessoal --days 30 --json --quiet
```

## MVP commands
```bash
ig config set provider meta-byo
ig auth login --provider meta-byo
ig auth status
ig auth logout

ig publish photo --account pessoal --file https://example.com/a.jpg --caption "..." --json
ig publish video --account pessoal --file https://example.com/a.mp4 --caption "..." --json
ig publish carousel --account pessoal --files https://example.com/a.jpg https://example.com/b.jpg --caption "..." --json

ig media list --account pessoal --limit 10 --json
ig comments list --account pessoal --media <id> --json
ig comments inbox --account pessoal --days 7 --limit 20 --json
ig comments reply --account pessoal --comment <id> --text "..." --json
ig comments reply --account pessoal --ai --text "<comment text>" --json
ig analytics top-posts --account pessoal --days 30 --limit 10 --json
ig analytics summary --account pessoal --days 7 --json
```

## Central API scaffold
`apps/central-api` exposes:
- `POST /oauth/start`
- `POST /oauth/callback`
- `GET /session`
- `POST /publish/photo`
- `POST /publish/video`
- `POST /publish/carousel`
- `GET /media/list`
- `GET /comments/list`
- `POST /comments/reply`

## Production prep
See `docs/pre-production-checklist.md`.
