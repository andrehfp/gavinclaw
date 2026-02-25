# Railway + GitHub Deploy Guide

This guide deploys both services:
- `central-api` (backend OAuth/bootstrap API)
- `landing` (frontend login gateway)

## 1. Connect GitHub
1. Open Railway dashboard.
2. Create a new project from your GitHub repository (`instacli`).
3. Keep auto-deploy enabled for your branch.

## 2. Create backend service (`central-api`)
1. Add a new service in the same Railway project.
2. Keep service root at repository root.
3. Set build command:
```bash
pnpm install --frozen-lockfile && pnpm railway:build:central
```
4. Set start command:
```bash
pnpm railway:start:central
```

### Backend env vars
Required:
```bash
HOST=0.0.0.0
IG_CENTRAL_OAUTH_PROVIDER=facebook
IG_CENTRAL_CLIENT_ID=YOUR_FACEBOOK_APP_ID
IG_CENTRAL_CLIENT_SECRET=YOUR_FACEBOOK_APP_SECRET
IG_CENTRAL_REDIRECT_URI=https://api.YOUR_DOMAIN.com/oauth/callback
IG_CENTRAL_SIGNING_SECRET=LONG_RANDOM_SECRET_32+CHARS
```

Recommended:
```bash
IG_CENTRAL_BOOTSTRAP_TTL_MS=300000
IG_CENTRAL_BOOTSTRAP_MAX_CODES=10000
IG_CENTRAL_RATE_LIMIT_FILE=/tmp/instacli-central-rate-limit.json
```

## 3. Create frontend service (`landing`)
1. Add another service in the same Railway project.
2. Keep service root at repository root.
3. Set build command:
```bash
pnpm install --frozen-lockfile && pnpm railway:build:landing
```
4. Set start command:
```bash
pnpm railway:start:landing
```

### Frontend env vars
```bash
HOST=0.0.0.0
LANDING_API_BASE_URL=https://api.YOUR_DOMAIN.com
```

## 4. Add domains
1. Attach custom domain for backend (example: `api.YOUR_DOMAIN.com`).
2. Attach custom domain for frontend (example: `login.YOUR_DOMAIN.com`).

## 5. Configure Facebook Login
In Meta App Dashboard -> Facebook Login -> Settings:
1. Valid OAuth Redirect URI:
```text
https://api.YOUR_DOMAIN.com/oauth/callback
```
2. Ensure app is in Live mode for real users.
3. Ensure required scopes are approved for your use case.

## 6. Smoke test in production
1. Open frontend URL (example: `https://login.YOUR_DOMAIN.com`).
2. Click `Continue with Facebook`.
3. Complete login and copy `Bootstrap code: IGB-...` from callback page.
4. In agent terminal:
```bash
instacli setup central-bootstrap --code IGB-XXXXXXX --json --quiet
```
5. Verify:
```bash
instacli auth status --json --quiet
instacli media list --json --quiet
```

## 7. Notes for scale
Current `bootstrap_code` store is in-memory (per process). For multi-replica backend:
1. Move bootstrap store to Redis (recommended).
2. Keep one replica until Redis is in place.
