# Spark OSS Launch Documentation Map

Use this as the onboarding map for a public OSS launch.

## 1) Start here

- `README.md`
- `OSS_ONLY_MANIFEST.md`
- `docs/DOCS_INDEX.md`
- `docs/GLOSSARY.md`
- `docs/GETTING_STARTED_5_MIN.md`
- `docs/QUICKSTART.md`

## 2) Intelligence flow

- `Intelligence_Flow.md`
- `docs/PROJECT_INTELLIGENCE.md`
- `docs/CONSCIOUSNESS_BRIDGE_V1.md`
- `docs/MEMORY_ACTIONABILITY_FRAMEWORK.md`
- `docs/RETRIEVAL_LEVELS.md`
- `docs/OPEN_CORE_FREEMIUM_MODEL.md` (which parts are premium-only)

## 3) Tuneables and routing

- `TUNEABLES.md`
- `docs/TUNEABLES_REFERENCE.md`
- `docs/SPARK_LIGHTWEIGHT_OPERATING_MODE.md`
- When tuning:
  - Edit `config/tuneables.json`
  - Use `scripts/apply_advisory_wow_tuneables.py` for benchmark-guided updates
  - Re-check `spark status` and `spark tuneables --dump` after changes

## 4) Tool integrations

- `docs/claude_code.md`
- `docs/cursor.md`
- `docs/OPENCLAW_INTEGRATION.md`
- `docs/OPENCLAW_OPERATIONS.md`
- `docs/OPENCLAW_PATHS_AND_DATA_BOUNDARIES.md`
- `docs/OPENCLAW_INTEGRATION.md` includes common integration patterns for hook, payload hygiene, and troubleshooting.

Recommended reading order for the integration set:
1. `docs/claude_code.md` or `docs/cursor.md`
2. `docs/OPENCLAW_OPERATIONS.md`
3. `docs/OPENCLAW_INTEGRATION.md`

## 5) Boundaries, safety, and launch posture

- `docs/OSS_BOUNDARY.md`
- `docs/OPEN_CORE_FREEMIUM_MODEL.md`
- `docs/security/THREAT_MODEL.md`
- `docs/RESPONSIBLE_PUBLIC_RELEASE.md`
