# ViralClaw Dashboard Spec

## Auth System (FastAPI)
- Table `users`: id, email, password_hash (bcrypt), created_at, is_active
- Link users → api_keys (1 user = 1 default API key)
- `POST /auth/signup` → bcrypt hash, create user + API key + 3 free credits
- `POST /auth/login` → verify password → JWT (httpOnly cookie, 7 day expiry)
- `POST /auth/logout` → clear cookie
- `GET /auth/me` → current user info + credits
- Middleware: validate JWT on protected routes
- JWT secret from env var `JWT_SECRET`
- Rate limiting: 5 signup/min, 10 login/min per IP

## Dashboard Pages
1. **Login/Signup** — clean form, email + password
2. **Dashboard Home** — credit balance, recent jobs, quick upload
3. **Upload** — drag & drop video, select format (shorts/threads/quote cards), submit
4. **Jobs List** — all jobs with status badges (processing/done/failed), timestamps
5. **Job Detail** — preview generated content, download buttons (signed URLs), metadata
6. **Settings** — API key display, plan info, billing link (Stripe portal)

## Tech Stack
- FastAPI backend (existing)
- HTML + Tailwind CSS + Alpine.js (lightweight, no build step)
- Served from FastAPI static files
- Cookie-based JWT auth (httpOnly, secure, SameSite=Lax)

## Design
- Dark theme (existing palette: purple gradient, dark bg)
- Responsive (mobile-first, creators use phones)
- Loading states with skeleton screens
- Toast notifications for success/error

## Security
- bcrypt password hashing (12 rounds)
- httpOnly cookies (no JS access to token)
- CSRF protection via SameSite cookie
- Rate limiting on auth endpoints
- Input validation (email format, password min 8 chars)
- SQL injection prevention (SQLAlchemy parameterized queries)
