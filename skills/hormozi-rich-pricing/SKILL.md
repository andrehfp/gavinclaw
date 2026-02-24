---
name: hormozi-rich-pricing
description: >
  Build premium pricing and offer strategy using Alex Hormozi's "sell to rich" framework.
  Use when the user wants to define pricing tiers, move upmarket, improve margins, create high-ticket offers,
  or package services for affluent buyers and premium business clients. Outputs: tier matrix,
  offer packaging, close-rate diagnostics, ICP filters, and premium sales messaging.
---

# Hormozi Rich Pricing

Use this skill to price from the top down and stop competing for low-budget buyers.

## Core thesis
- You are under-earning because you are selling to people without spending power.
- Price for buyers who can pay, not for your own wallet.
- It is better to serve fewer premium clients at higher price than many low-budget clients manually.

## Workflow

### 1) Pick the right customer first
Define the premium ICP before pricing:
- industry / niche
- current revenue band
- budget band
- urgency and pain level

If ICP has low spending power, reposition before touching price.

### 2) Build tiered pricing with large jumps
Create 3 to 4 tiers with strong differentiation.
Default jump rule:
- Tier N+1 = 5x to 10x Tier N

Default conversion expectation per upsell:
- roughly 20% of previous tier buyers

Do not keep tiers close in price. Small jumps trap you in commodity comparisons.

### 3) Increase value with each tier
Each higher tier must include stronger outcomes, not just more features.
Use premium levers:
- speed of result
- certainty / de-risking
- hands-on support
- done-with-you or done-for-you implementation

### 4) Validate with close-rate diagnostics
Use these guardrails:
- close rate > 60%: likely underpriced
- close rate 30% to 40%: usually healthy pricing zone
- close rate < 30%: improve offer, targeting, or sales process

### 5) Refine positioning signals
Premium buyers read pricing as a quality signal.
Avoid discount-heavy messaging.
Use language that signals selectivity and outcome ownership.

## Output format
Always return these blocks:
1. Premium ICP definition
2. Tier matrix (price, who it is for, value promise, expected take rate)
3. Margin and delivery notes
4. Sales script snippets for each tier
5. 14-day pricing test plan

## Rules
- Never set price from your own budget comfort.
- Never optimize first for maximum volume with manual delivery.
- Never add a premium tier without a clearly stronger outcome.
- Prefer fewer clients + higher margin when delivery is human-intensive.

## References
- Read `references/pricing-playbook.md` for templates, formulas, and objection handling.
- Use `scripts/tier_calculator.py` to generate tier ladders quickly.
