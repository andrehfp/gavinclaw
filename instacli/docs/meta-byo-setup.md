# Meta BYO App Setup

This onboarding shows exactly where to get credentials and complete first login. The recommended path is token-first (no redirect URI).

If you want a strict app/page creation walkthrough, start here:
- `docs/meta-onboarding-step-by-step.md`

## Link hub
- Meta App Dashboard: https://developers.facebook.com/apps
- Graph API Explorer: https://developers.facebook.com/tools/explorer/
- Instagram Graph API docs: https://developers.facebook.com/docs/instagram-platform
- Facebook Login docs: https://developers.facebook.com/docs/facebook-login
- Access tokens docs: https://developers.facebook.com/docs/facebook-login/guides/access-tokens

## Prerequisites
- Instagram account must be Professional (`Business` or `Creator`).
- Instagram account must be connected to a Facebook Page.
- App user/tester must be configured in Meta app (if app is in development mode).

## Token-first flow (practical first login)
1. Create/open app at https://developers.facebook.com/apps (Business app type recommended).
2. Generate a **User Access Token** in Graph API Explorer with scopes:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
3. Exchange for long-lived token:
   - `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...`
4. Get page access token:
   - `GET /me/accounts` using long-lived user token
5. Get IG account id:
   - `GET /{page_id}?fields=instagram_business_account{id,username}`
6. Save these values in CLI:
   - `ig_account_id`
   - `page_access_token`
   - `ig_username` (optional but useful)

## Credentials map
| Variable | Where to find/configure |
| --- | --- |
| `IG_META_CLIENT_ID` | App Dashboard -> `Settings` -> `Basic` -> `App ID` |
| `IG_META_CLIENT_SECRET` | App Dashboard -> `Settings` -> `Basic` -> `App Secret` |
| `IG_META_REDIRECT_URI` | `Facebook Login` -> `Settings` -> `Valid OAuth Redirect URIs` |

Optional rate-limit guardrails:
- `IG_META_MIN_REQUEST_INTERVAL_MS` (default `0`)
- `IG_META_GET_RETRY_MAX` (default `2`, GET-only)
- `IG_META_GET_CACHE_TTL_MS` (default `3000`)

Use this redirect URI unless you need a different port:
`http://localhost:8788/callback`

## Recommended setup (token-first, no redirect URI)
```bash
pnpm build
node packages/ig-cli/dist/bin.js
node packages/ig-cli/dist/bin.js auth status --json --quiet
```
`ig` without subcommand starts guided onboarding automatically when no config is found.

## Step-by-step onboarding (recommended process)
1. Generate a **User Access Token** in Graph API Explorer with:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
2. Run guided discovery:
```bash
node packages/ig-cli/dist/bin.js setup meta-token --discover-pages --user-access-token YOUR_USER_ACCESS_TOKEN
```
This will:
- list candidate Facebook Pages
- detect pages that have `instagram_business_account`
- auto-select when exactly one valid page is found
- require `--page-id` when multiple valid pages are found (with suggested commands in error output)
- save `ig_account_id` + `page_access_token` + optional username

3. Validate immediately:
```bash
ig auth status --json --quiet
ig media list --limit 5 --json --quiet
```

## Multi-account setup (recommended)
Add each profile with a clear account name:

```bash
ig accounts add --name pessoal --ig-account-id <id> --page-access-token <token> --ig-username andrefprado
ig accounts add --name maia --ig-account-id <id> --page-access-token <token> --ig-username studio.maia.arch
ig accounts list --json --quiet
ig accounts use pessoal --json --quiet
```

Use `--account` on operational commands:
```bash
ig media list --account pessoal --limit 5 --json --quiet
ig comments list --account maia --media <id> --json --quiet
ig insights account --account pessoal --period week --json --quiet
```

Publish with hard guardrail:
```bash
ig publish photo --account pessoal --file https://example.com/a.jpg --caption "..." --confirm-account @andrefprado --json --quiet
```

## Manual fallback (if discovery is not used)
```bash
# 1) Get pages + page tokens
curl -s "https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=YOUR_USER_ACCESS_TOKEN" | jq .

# 2) Get IG account from selected page
curl -s "https://graph.facebook.com/v20.0/PAGE_ID?fields=instagram_business_account{id,username}&access_token=PAGE_ACCESS_TOKEN" | jq .
```

Then configure CLI:
```bash
ig setup meta-token \
  --ig-account-id IG_ACCOUNT_ID \
  --page-access-token PAGE_ACCESS_TOKEN \
  --ig-username IG_USERNAME
```

Non-interactive token-first:
```bash
node packages/ig-cli/dist/bin.js setup meta-token \
  --ig-account-id YOUR_IG_ACCOUNT_ID \
  --page-access-token YOUR_PAGE_ACCESS_TOKEN \
  --ig-username YOUR_IG_USERNAME \
  --json --quiet
```

## OAuth setup (optional)
```bash
pnpm build
node packages/ig-cli/dist/bin.js onboarding --open-links
node packages/ig-cli/dist/bin.js setup meta-byo
```

What this does:
- prompts for App ID/App Secret/Redirect URI
- writes/updates `.env`
- sets provider to `meta-byo`

## Automation setup (non-interactive)
```bash
node packages/ig-cli/dist/bin.js setup meta-byo \
  --client-id YOUR_APP_ID \
  --client-secret YOUR_APP_SECRET \
  --redirect-uri http://localhost:8788/callback \
  --json --quiet
```

## OAuth login and verify
```bash
node packages/ig-cli/dist/bin.js auth login --provider meta-byo
node packages/ig-cli/dist/bin.js auth status --json --quiet
```

## Troubleshooting

### "App isn’t using a secure connection"
1. In Meta, verify `Facebook Login` -> `Settings` -> `Valid OAuth Redirect URIs` contains exactly:
   `http://localhost:8788/callback`
2. Confirm `.env` has the same value in `IG_META_REDIRECT_URI`.
3. Prefer `localhost` (not `127.0.0.1`) for this redirect.

### Login opens but callback fails
- Ensure port `8788` is free.
- Ensure no typo in path (`/callback`).

### Token/permission errors after login
- Re-check app permissions/scopes and account/page linkage.
- Validate scopes in Graph API Explorer before retrying CLI login.
- For token-first setup, confirm the token used is the **page_access_token** (not app token).
- If error says node type is `Application`, you are using `App ID` instead of `IG_ACCOUNT_ID`.
- If error says `Invalid OAuth access token - Cannot parse access token`, token is malformed/placeholder/truncated.

## Local file upload helper
- Meta BYO publish still requires a public HTTPS URL in `--file`.
- Use `instacli upload file --file <path-or-url> --json --quiet` to resolve a URL for publishing.
- Upload strategies:
  - `--via auto` (default): pass through HTTPS URLs, upload local files to `uguu`.
  - `--via uguu`: force upload local file to `uguu`.
  - `--via litterbox --litterbox-expiry 1h|12h|24h|72h`: upload local file to Litterbox.
  - `--via passthrough`: only accept existing `https://` URLs.

## Security notes
- Never commit `.env`.
- If a secret was exposed, rotate it in Meta Dashboard (`Settings` -> `Basic`) immediately.
- Treat third-party upload URLs as public. Do not use confidential media.
