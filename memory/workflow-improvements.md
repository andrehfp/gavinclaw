# Workflow Improvements — 2026-02-13

## Cron Optimization Opportunities

### Instagram Reels Consolidation
**Current:** 5 separate one-shot jobs (ig-reel-3 to ig-reel-6)
**Better:** Single recurring job that fetches next short from ViralClaw job 44
**Why:** Less cron job clutter, easier management
**Implementation:** After current batch completes

### Daily Schedule Enhancement  
**Current:** Lists scheduled posts
**Add:** Include cron job status (enabled/disabled), next run times
**Add:** Check for failed recent jobs and alert
**Location:** job `e049b4d8-70eb-4ee8-8400-937cd74f2529`

### MoldaSpace Metrics Integration
**Add:** Auto-update dashboard data before daily report
**Current:** Manual dashboard reads
**Add:** PostHog API call to get fresh metrics

---

*Priority: Medium — current workflows stable*