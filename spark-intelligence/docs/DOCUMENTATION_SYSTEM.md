# Spark Documentation System

Date: 2026-02-18
Scope: `vibeship-spark-intelligence` + integration touchpoints with `vibeship-spark-consciousness`

## Why This Exists

Documentation volume grew faster than documentation governance.
This file defines the mandatory system for keeping docs clean, non-contradictory, and current.

## Documentation Layers (Authority Order)

1. Runtime truth (highest)
- Code behavior, tests, and live health/status endpoints.

2. Canonical operator docs
- `docs/DOCS_INDEX.md`
- `docs/CHANGE_AND_UPGRADE_WORKFLOW.md`
- `TUNEABLES.md`
- `VIBESHIP_OPTIMIZER.md`
- `docs/PROGRAM_STATUS.md`

3. Domain runbooks/specs
- Integration and subsystem docs (OpenClaw, advisory, retrieval, observability, security, support).

4. Point-in-time reports
- internal launch evidence snapshots (historical files are retained in non-public release bundles).

If a lower layer conflicts with a higher layer, update or archive the lower layer.

## Mandatory Change Rule

Any runtime behavior change is incomplete unless these are updated in the same change set:
- runtime code/tests,
- impacted canonical docs/runbooks,
- optimizer evidence (`before`, `after`, compare, decision).

Use:
- `docs/CHANGE_AND_UPGRADE_WORKFLOW.md`
- `VIBESHIP_OPTIMIZER.md`

## Doc Hygiene Rules

1. One canonical source per topic
- Avoid parallel "how it works" docs for the same surface.
- Non-canonical docs must point to the canonical one in the first section.

2. Keep index curated
- `docs/DOCS_INDEX.md` lists canonical/active docs only.
- Do not list every historical report.

3. Keep reports structured
- Keep current highlights in release notes or gated evidence bundles.
- Historical run evidence is retained outside public docs in private release bundles.

4. Archive stale documents
- Archive when a doc is superseded, duplicated, or no longer operationally used.
- Move, do not delete, unless explicitly approved.

5. Minimize contradiction risk
- If docs conflict, treat as incident-level documentation bug and fix in the next commit.

## Archive Policy

Archive candidates:
- superseded implementation plans,
- duplicated operational guides,
- repetitive generated reports no longer used for daily operation.

Archive method:
1. Move file to a gated release-archive location (not in public OSS docs).
2. Add a one-line pointer in the active replacement doc if needed.
3. Record the change in the private archive changelog.

## Reports Retention Policy

- Keep current-facing summary in release notes or gated evidence bundle.
- Keep historical evidence in private release bundles.
- Keep repetitive run artifacts under a gated internal archive location.

## Cross-Repo Sync (Spark Consciousness)

For any contract/interface touching both repos:
1. Update docs in both repos in the same change window.
2. Validate bridge contracts with tests/smoke.
3. Log evidence in the Spark Intelligence report for traceability.

Minimum cross-repo references to keep aligned:
- `docs/architecture/CONSCIOUSNESS_INTELLIGENCE_ALIGNMENT_TASK_SYSTEM.md`
- `docs/CONSCIOUSNESS_BRIDGE_V1.md`
- latest integration verification pointer in the private release bundle for cross-repo contracts

## Operating Cadence

Daily:
1. Confirm new changes updated affected docs.
2. Add latest report pointer if a major validation ran.

Weekly:
1. Archive stale/duplicate docs and repetitive run artifacts.
2. Re-check `docs/DOCS_INDEX.md` against active operational reality.

Monthly:
1. Full docs integrity pass: contradictions, stale commands/ports/paths, missing references.
2. Cross-repo contract review with Spark Consciousness.

## Definition Of Done For Documentation

A change is complete only when:
- canonical docs are updated,
- historical evidence is linked (if behavior changed),
- rollback path is documented,
- stale parallel docs are either updated to pointer form or archived.
