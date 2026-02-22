# Service Level Objectives (Local-First)

These SLOs are designed for a local-first alpha where the "site" is the user's machine.
They are still useful because they define when the system is stable enough to trust.

## SLO-1: sparkd readiness

- Indicator: `GET /status` returns 200 with `ok: true`
- Target: 99% over a 24h window (when services are running)
- Alert: readiness fails for 3 consecutive checks (>= 30s) or returns non-JSON

## SLO-2: bridge worker heartbeat freshness

- Indicator: `bridge_worker` heartbeat age (via CLI `spark services` or `/status`)
- Target: heartbeat age <= 90s
- Alert: heartbeat age > 120s

## SLO-3: queue safety

- Indicator: queue depth and rotation
- Target: queue within configured bounds (see `config/tuneables.json`)
- Alert: oldest-event age increases continuously for 10 minutes OR queue rotation fails

## SLO-4: observability usable

- Indicator: Pulse returns 200 and Observatory auto-sync completes
- Target: Pulse reachable on localhost when enabled; Observatory regenerates within cooldown

