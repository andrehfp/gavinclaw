# Spark x Gavin - Minimal Flow (20 min)

## Goal
Use Spark as local memory/reflection layer while Gavin keeps execution + strategy.

## What is already done
- Spark cloned at `~/.openclaw/workspace/spark-intelligence`
- Virtualenv created and package installed (`-e .[services]`)
- Services running in lite mode (sparkd + bridge_worker + scheduler)
- `SPARK_WORKSPACE` fixed to OpenClaw workspace via wrapper script
- `SPARK_CONTEXT.md` now generated at workspace root

## Daily usage (simple)
```bash
# 1) Keep Spark up
scripts/spark-openclaw services

# 2) Refresh context from learnings (before planning sessions)
scripts/spark-openclaw bridge-update

# 3) Inspect what Spark learned
scripts/spark-openclaw learnings 20
```

## Weekly usage
```bash
# Scan + list capture suggestions
scripts/spark-openclaw capture-scan 30
```

Then review and approve only high-value suggestions.

## Recommended workflow with Gavin
1. Start day: `scripts/spark-openclaw bridge-update`
2. Ask Gavin for priorities using current context.
3. End of day: run `scripts/spark-openclaw learnings 20` and keep only useful insights.

## Commands
```bash
scripts/spark-openclaw up
scripts/spark-openclaw health
scripts/spark-openclaw services
scripts/spark-openclaw bridge-status
scripts/spark-openclaw bridge-update
scripts/spark-openclaw learnings 20
scripts/spark-openclaw down
```
