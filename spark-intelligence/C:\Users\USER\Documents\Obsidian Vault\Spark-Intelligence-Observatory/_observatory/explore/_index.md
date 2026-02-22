---
type: "spark-explorer-index"
---

# Explore Spark Intelligence

> [[../flow|Intelligence Flow]] | Browse individual items from every stage

## Data Stores

| Store | Items Exported | Max | Browse |
|-------|---------------|-----|--------|
| Cognitive Insights | 1 pages | 200 | [[cognitive/_index]] |
| EIDOS Distillations | 1 pages | 200 | [[distillations/_index]] |
| EIDOS Episodes | 1 pages | 100 | [[episodes/_index]] |
| Meta-Ralph Verdicts | 1 pages | 100 | [[verdicts/_index]] |
| Promotion Log | 1 pages | 200 | [[promotions/_index]] |
| Advisory Effectiveness | 1 pages | 200 | [[advisory/_index]] |
| Retrieval Routing | 1 pages | 100 | [[routing/_index]] |
| Tuneable Evolution | 1 pages | 200 | [[tuning/_index]] |
| Advisory Decisions | 1 pages | 200 | [[decisions/_index]] |
| Implicit Feedback | 1 pages | 200 | [[feedback/_index]] |

## Adjusting Limits

All limits are configurable in `~/.spark/tuneables.json` under the `observatory` section:

```json
"observatory": {
    "explore_cognitive_max": 200,
    "explore_distillations_max": 200,
    "explore_episodes_max": 100,
    "explore_verdicts_max": 100,
    "explore_promotions_max": 200,
    "explore_advice_max": 200,
    "explore_routing_max": 100,
    "explore_tuning_max": 200,
    "explore_decisions_max": 200,
    "explore_feedback_max": 200
}
```

Then regenerate: `python scripts/generate_observatory.py --force --verbose`
