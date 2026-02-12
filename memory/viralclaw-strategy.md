# ViralClaw Strategy — $10k/month Goal

## Status: Pre-revenue (Feb 2026)
- 0 paying customers, André is sole user
- Product works: 6 formats (shorts, carousels, threads, quote cards, audiograms, repurpose)
- Stack: FastAPI + PostgreSQL + Redis + Modal + R2
- Pricing: $29 = 200 credits (1 credit = 1 output generated)
- Live at: api.viral-claw.com / viral-claw.com

## Strategic Direction: Agent-First
- Target customer: AI agents (OpenClaw ecosystem), not humans directly
- Human pays the bill, agent does the work
- Distribution: ClaHub skill marketplace → agents discover → agents use → humans pay
- No B2C UI war with Opus Clip ($150M+ funded)

## Math to $10k/month
- $29/pack × 345 purchases = $10k
- Or ~170 active users buying 2x/month
- Or ~50 power users buying 7x/month

## Open Issues (GitHub)
1. #1 — Free credits 3 → 20 (reduce friction)
2. #2 — Agent-friendly signup (no password required)
3. #3 — Complete llms.txt (agent-readable docs)
4. #4 — Robust webhook delivery

## Priority Actions
1. Fix onboarding friction (#1, #2, #3) — agents must self-serve perfectly
2. Grow OpenClaw ecosystem = grow ViralClaw TAM
3. List on tool directories (AI agent marketplaces)
4. Content marketing showing agent workflows

## Ideas Backlog
- [ ] OpenAPI spec optimized for LLM function-calling
- [ ] Stripe integration for self-serve credit purchase (agent-initiated?)
- [ ] Usage-based pricing tier for high-volume agents
- [ ] Partner with content-focused AI agent builders
- [ ] "Powered by ViralClaw" watermark on free tier outputs
- [ ] Affiliate program for agent developers

## Key Decisions
- André controls code, Gavin controls strategy
- Issues go to github.com/andrehfp/viralclaw-api
- Updates reported in Telegram topic 1482

## Constraints
- Gavin does NOT execute code changes
- André is the liaison for technical execution
