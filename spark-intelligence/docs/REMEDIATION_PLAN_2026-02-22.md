# Remediation Plan - 2026-02-22

Scope: validate and remediate findings from the consolidated audit report against current `HEAD` (`e92230a235cf5616de6c1b6b08e4e0abf660fe77`).

## Validation Matrix (Current HEAD)

| ID | Audit claim | Current status | Validation notes |
|---|---|---|---|
| H-01 | `mind_server` auth breaks `lib/mind_bridge.py` | Valid | `mind_server` enforces bearer auth; `mind_bridge` does not send auth header on POST. Reproduced 401 on `sync_insight`. |
| H-02 | `sparkd` auth rollout mismatch in adapters/docs | Valid | `sparkd` auto-resolves token and enforces POST auth; adapters only use arg/env token; docs still describe conditional auth. |
| H-03 | Queue overflow write race can drop events | Valid | Reproduced silent loss (`99/100` persisted, all writes returned `True`) under concurrent `quick_capture`. |
| M-01 | Benchmark wrapper broken by missing `benchmarks/generators` | Resolved upstream | `benchmarks/generators` exists; `python benchmarks/run_benchmarks.py --help` works. |
| M-02 | Broad non-integration pytest baseline is red | Valid | `python -m pytest -q -m "not integration"` currently fails (5 tests). |
| M-03 | Queue concurrency tests stale vs `QUEUE_STATE_FILE` | Valid | `tests/test_queue_concurrency.py` patches queue paths but not `QUEUE_STATE_FILE`. |
| M-04 | Opportunity scanner test import-order flake | Valid | `tests/test_opportunity_scanner.py` patches `lib.opportunity_scanner`, but advisor uses adapter alias from `lib.opportunity_scanner_adapter`. |
| M-05 | `SELF_IMPROVEMENT_SYSTEMS.md` overstates maturity | Valid | File claims fully operational systems while several referenced scripts/modules are absent. |
| M-06 | Retired `advisory_profile_sweeper.py` referenced but missing | Resolved upstream | `benchmarks/advisory_profile_sweeper.py` exists on current `HEAD`. |
| L-01 | README dashboard wording stale | Partially valid | README still implies local dashboard flow while `spark_pulse.py` is an external redirector; wording should be tightened. |
| L-02 | `EIDOS_QUICKSTART.md` wrong dashboard script path | Valid | Doc uses `python eidos_dashboard.py`, actual script is `scripts/eidos_dashboard.py`. |
| L-03 | `consume_processed()` docstring stale | Valid | Docstring still describes line-strip implementation; code uses head-byte state progression. |

## Execution Tasks

## Batch 1 (P0/P1 behavior regressions)
1. Fix H-01 by adding Mind token resolution and auth header support in `lib/mind_bridge.py`.
2. Fix H-02 by adding token auto-discovery (`~/.spark/sparkd.token`) in adapters and updating auth docs.
3. Fix H-03 by serializing overflow sidecar writes with a dedicated overflow lock path.

## Batch 2 (P2 test signal)
4. Fix M-03 by patching `QUEUE_STATE_FILE` in queue concurrency tests.
5. Fix M-04 by patching the adapter alias target in opportunity scanner tests.
6. Fix M-02 baseline regressions currently failing in advisor/calibration tests.

## Batch 3 (docs integrity and low-severity cleanup)
7. Fix M-05 by reclassifying `docs/SELF_IMPROVEMENT_SYSTEMS.md` to current-state/roadmap language.
8. Fix L-01/L-02/L-03 documentation drift.

## Validation/Audit Pass (post-fix)
9. Run focused tests for changed areas.
10. Run `python -m pytest -q -m "not integration"`.
11. Run security/release checks (`scripts/public_release_safety_check.py`, `scripts/verify_test_baseline.py`).
12. Publish post-fix audit summary with residual risks.
