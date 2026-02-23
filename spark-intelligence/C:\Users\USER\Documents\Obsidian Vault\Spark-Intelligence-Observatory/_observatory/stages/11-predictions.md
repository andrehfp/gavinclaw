# Stage 11: Predictions

> Part of the [[../flow|Intelligence Flow]]
> Upstream: [[03-pipeline|Pipeline]]
> Downstream: [[07-eidos|EIDOS]]

**Purpose:** Tracks prediction-outcome pairs for surprise detection. Predictions made on pre_tool, outcomes recorded on post_tool. Surprise drives learning priority.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Predictions | ~1 | healthy |
| Outcomes | ~1 | healthy |
| Outcome links | ~0 | healthy |
| Link rate | 0% | WARNING |
| Prediction state keys | 7 | healthy |
## Recent Outcomes

1. `{'type': 'agent_feedback', 'result': 'Instagram posts duplicados ocorreram com retry ambíguo.', 'success': None, 'lesson': 'InstaCLI deve ter dedupe nativo e reconciliação de feed antes de novo publis`

## Source Files

- `hooks/observe.py (prediction logic)` — Core implementation
- `~/.spark/predictions.jsonl` — State storage
- `~/.spark/outcomes.jsonl` — State storage
- `~/.spark/outcome_links.jsonl` — State storage
- `~/.spark/prediction_state.json` — State storage
- `~/.spark/outcome_predictor.json` — State storage
