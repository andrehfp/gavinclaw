# Advisory Day Trial (24h Real-Time)

This runbook gives you a no-dashboard, CLI-only loop to validate Spark advisory quality in real usage for one day.

## What It Measures

- Advisory engagement: how often advice is shown and tagged.
- User-perceived value: acceptance, override, noisy, edited/adapted rates.
- Retrieval quality proxy: matched vs unresolved advisory/action links.
- Memory source usage: which sources are actually powering recommendations.
- Gate readiness: production gates + canary pass/fail at close.

## 1) Start A Trial

```bash
python scripts/advisory_day_trial.py start --trial-id spark_day1
```

Default canary thresholds are set to the current realistic promotion profile:

- memory MRR `>= 0.245`
- memory domain gate pass rate `>= 0.32`
- advisory winner score `>= 0.49`

Output:

- `docs/reports/day_trials/<trial_id>/state.json`
- `docs/reports/day_trials/<trial_id>/HOW_TO_RUN.md`

## 2) Tag Outcomes During Real Work

Use the existing tag CLI while you work:

```bash
python scripts/advisory_tag_outcome.py --tool Bash --status acted --notes "helpful and used"
python scripts/advisory_tag_outcome.py --tool Edit --status blocked --notes "noisy for this context"
python scripts/advisory_tag_outcome.py --tool Edit --status acted --notes "edited adaptation before applying"
```

Status mapping:

- `acted`: accepted
- `blocked` / `harmful`: rejected/noisy
- `ignored`: neutral

Tip: include words like `edited`, `adapted`, or `modified` in notes when advice was useful but changed before use.

## 3) Mid-Day Snapshot (Optional)

```bash
python scripts/advisory_day_trial.py snapshot --trial-id spark_day1
```

This writes a timestamped JSON/Markdown snapshot in:

- `docs/reports/day_trials/<trial_id>/`

## 4) Close Trial + Final Report

```bash
python scripts/advisory_day_trial.py close --trial-id spark_day1
```

By default, close also runs the canary (`run_advisory_retrieval_canary.py`) and embeds the result in the final report.

Use `--skip-canary` only if you need a quick report without benchmark runtime.

## Day-End Report Contains

- Acceptance/override/noisy/edited rates
- Retrieval match/unresolved rates
- Top memory sources used in advisory requests
- Top 5 wow moments
- Top 5 failure modes
- Production gate status
- Canary promotion vs rollback result

