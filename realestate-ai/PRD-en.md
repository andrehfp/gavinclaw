# PRD — Reelisted
*AI-powered content automation for real estate agents*

**Status:** Pre-MVP  
**Date:** 2026-02-19  
**Owner:** André Prado  
**Domain:** reelisted.com

---

## 1. Problem

Real estate agents know they need consistent social media presence — videos, carousels, ads — but don't have the time or skills to produce it. They spend $300–2,500/month on Meta Ads with invisible ROI because their creatives are weak.

Existing tools (Canva + ChatGPT manual, Curaytor, PropertySimple) either don't generate video at all or require hours of manual work. No competitor delivers Reel + carousel + ad copy in one automated product.

**Pain #1:** Can't produce consistent content  
**Pain #2:** Meta Ads underperform due to weak creatives  
**Pain #3:** Overwhelmed — they do marketing, sales, and admin alone

---

## 2. Solution

Agent uploads listing photos + fills a short form. In under 2 minutes they receive:

- 🎬 **Ready-to-post Reel** (15–30s, AI voiceover, background music)
- 🖼️ **Carousel** (5–8 slides with listing details + agent branding)
- 📢 **Meta Ad copy** (headline, body, CTA — ready to paste)
- 📸 **Static feed post** (branded image for Instagram/Facebook)

One click. Everything branded with their logo, colors, and contact info.

---

## 3. Target User

**Primary:** Independent real estate agent (US/international)
- Spends $300–800/month on Meta Ads
- Uses Instagram + Facebook as main channels
- Has no marketing team
- ~2M agents in the US alone

**Secondary:** Small real estate brokerages (5–20 agents)
- Spends $2k–5k/month on Meta Ads
- Needs brand consistency across agents

**Brazil (parallel market):** 450k registered agents, zero competitors in this category

---

## 4. MVP Features

### Core (v1)
- [ ] Listing photo upload (up to 10 photos)
- [ ] Listing form: type, bedrooms, bathrooms, price, location, 3 key features
- [ ] Reel generation (15–30s, AI voiceover + music)
- [ ] Carousel generation (5–8 slides, agent branding applied)
- [ ] Meta ad copy generation (headline + body + CTA)
- [ ] ZIP download of all assets
- [ ] Brand onboarding (logo, colors, agent name + contact)
- [ ] Dashboard with listing history and generated assets
- [ ] Credit system (1 listing = 1 content package)

### Out of MVP (v2)
- Direct publishing to Instagram/Facebook (Meta API)
- XML feed integration (Brazil: ZAP/Viva Real; US: MLS/IDX)
- Ad performance reporting
- Template customization
- Multi-user (brokerages)
- Virtual tour / 360° video

---

## 5. Tech Stack

```
Frontend:     Next.js 15 (App Router) + Tailwind
Auth:         Better Auth (open source, self-hosted — no vendor lock-in)
DB:           Neon (PostgreSQL) + Drizzle ORM
Payments:     Stripe (subscriptions + pay-per-use)
Async Jobs:   BullMQ + Redis (Upstash)
Storage:      Cloudflare R2

AI Services (already in production):
- Reels:      ViralClaw API (internal)
- Carousels:  KIE.ai Nano Banana Pro
- Ad copy:    OpenRouter (GPT-4o or Claude)
- Images:     KIE.ai GPT Image 1

Deploy:
- App:        Self-hosted (mediarr server) behind Caddy — $0/month
- Workers:    Same server or Railway
```

**Why Better Auth instead of Clerk:** Clerk is a third-party SaaS — when it goes down, your app goes down. Better Auth is open source, self-hosted, TypeScript-native, and works perfectly with Next.js App Router. Zero vendor dependency.

**Why not Laravel/PHP:** André's stack is Next.js/Node. Switching would add weeks of overhead during validation phase. If the product reaches $10k MRR, stack decisions can be revisited.

---

## 6. Architecture (MVP)

```
User
 └── Next.js App
      ├── Photo upload → R2
      ├── Listing form → Neon
      └── Trigger job → BullMQ Queue
                         └── Worker
                              ├── ViralClaw API → Reel MP4 → R2
                              ├── KIE.ai API → Carousel PNGs → R2
                              └── OpenRouter → Ad copy → Neon
                         └── SSE notification → Frontend updates
 └── Download ZIP (Reel + Carousel + AdCopy.txt)
```

---

## 7. Pricing

### International (USD) — Primary
| Plan | Price | Credits | Target |
|------|-------|---------|--------|
| Starter | $49/mo | 8 listings | Solo agent |
| Pro | $99/mo | 25 listings | Active agent |
| Agency | $249/mo | 70 listings | Small brokerage |
| Pay-as-you-go | $9/listing | — | No commitment |

### Brazil (BRL) — Parallel
| Plan | Price | Credits |
|------|-------|---------|
| Starter | R$97/mo | 8 listings |
| Pro | R$197/mo | 20 listings |
| Brokerage | R$497/mo | 60 listings |

**Unit economics per listing package:**
| Item | Cost |
|------|------|
| Reel (ViralClaw) | ~$0.50 |
| Carousel (KIE.ai) | ~$0.20 |
| Ad copy (OpenRouter) | ~$0.05 |
| **Total** | **~$0.75** |

- Starter margin: $49/8 = $6.12/listing → **88% gross margin**
- Pro margin: $99/25 = $3.96/listing → **81% gross margin**

---

## 8. Go-to-Market

### Phase 1 — Validate before building (Week 1–2)
- Cold demo outreach: find 50 agents on Instagram/LinkedIn with active listings
- Generate a sample Reel + carousel from their own public listing photos
- DM: *"Made this from your [address] listing. Would this save you time?"*
- Goal: 5/50 interested → 2–3 paying → validated

### Phase 2 — Community seeding (Week 2–6)
- **r/realtors (175k members):** answer marketing questions, add value — no promo yet
  - Account: u/listing_lab (fresh, building karma)
- **LinkedIn:** before/after posts (listing photo → generated Reel)
- **Facebook Groups:** "Real Estate Marketing" (80k+), "Real Estate Social Media"
- **Twitter/X:** build in public — "Building a content tool for real estate agents"

### Phase 3 — Content engine (Month 2)
- YouTube: *"How to create Instagram Reels for your listings in 2 minutes"* (SEO)
- Repurpose tutorials as Shorts via ViralClaw (dogfooding)
- Evergreen traffic from long-tail keywords

### Phase 4 — Partnerships (Month 3+)
- Real estate coaches/trainers with newsletters → affiliate at 30% recurring
- CRM integrations (Follow Up Boss, Lofty) → "powered by Reelisted"
- Listing photography companies (Aryeo ecosystem) → upsell offering

---

## 9. MVP Timeline

| Week | Deliverable |
|------|-------------|
| 1 | Next.js setup + Better Auth + Neon + R2 + Stripe |
| 1–2 | Photo upload + listing form + brand onboarding |
| 2–3 | ViralClaw integration (Reel generation) + BullMQ workers |
| 3 | KIE.ai integration (carousel generation) |
| 3–4 | OpenRouter integration (Meta ad copy) |
| 4 | Dashboard + history + ZIP download |
| 4–5 | UI polish + real agent testing |
| 5 | Closed beta (10 agents) |

**Estimated time to working MVP: 4–5 weeks.**

---

## 10. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Meta Ads API approval is slow | High | MVP delivers assets only, no auto-publishing |
| Reel quality not good enough | Medium | Test ViralClaw output first; offer manual fallback |
| Agents won't pay without trying | Medium | Free trial: 2 listings at signup |
| ViralClaw downtime | Low | André owns it — can prioritize fixes |
| Competitor launches first | Low | Gap is real but no dominant player exists |

---

## 11. Success Metrics

| Milestone | Target |
|-----------|--------|
| Week 2 | 5 cold demos → 2+ willing to pay |
| Month 1 | 10 paying agents |
| Month 3 | $5k MRR |
| Month 6 | $20k MRR (US) → expand internationally |
| Month 12 | $50k MRR |

---

## Notes

- **LeadCasa (previous attempt):** Failed because it was an intermediary (newsletter to leads). This product creates tangible assets agents use directly — different value prop entirely.
- **ViralClaw dogfooding:** Bugs found in Reelisted = bugs fixed in ViralClaw. Two products improve each other.
- **Domain:** `reelisted.com` — available, clean, memorable, works in English and Portuguese.
- **Reddit account:** u/listing_lab — created 2026-02-19, credentials in `realestate-ai/reddit-account.md`
