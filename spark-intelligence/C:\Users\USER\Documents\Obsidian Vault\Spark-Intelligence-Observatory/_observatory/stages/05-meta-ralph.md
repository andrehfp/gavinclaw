# Stage 5: Meta-Ralph

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[04-memory-capture|Memory Capture]] | [[03-pipeline|Pipeline]]
> Downstream: [[06-cognitive-learner|Cognitive Learner]]

**Purpose:** Quality gate for ALL insights. Multi-dimensional scoring: actionability, novelty, reasoning, specificity, outcome-linkage, ethics. Detects primitives, tautologies, circular reasoning, and noise.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Total roasted | 0 | healthy |
| Learnings stored | 0 | healthy |
| Pass rate (quality) | 0.0% | CRITICAL |
| Average total score | 0.0 | healthy |
## Dimension Averages (all time)

*Each dimension scored 0-2, summed to total (0-12). Higher is better.*

| Dimension | Avg Score | Bar |
|-----------|-----------|-----|
| actionability | 0.0 | `░░░░░░░░░░` |
| novelty | 0.0 | `░░░░░░░░░░` |
| reasoning | 0.0 | `░░░░░░░░░░` |
| specificity | 0.0 | `░░░░░░░░░░` |
| outcome_linked | 0.0 | `░░░░░░░░░░` |
| ethics | 0.0 | `░░░░░░░░░░` |

## Recommendations

*Auto-generated based on dimension averages below 1.5/2.0.*

- **actionability**: Insights lack clear next-steps. Focus on capturing concrete actions, not observations.
- **novelty**: Too many repetitive insights passing the gate. Consider raising the dedupe similarity threshold.

## Deep Dive

- [[../explore/verdicts/_index|Browse Individual Verdicts]] — score breakdowns, input text, issues

## Source Files

- `lib/meta_ralph.py` — Core implementation
- `~/.spark/meta_ralph/learnings_store.json` — State storage
- `~/.spark/meta_ralph/roast_history.json` — State storage
- `~/.spark/meta_ralph/outcome_tracking.json` — State storage
