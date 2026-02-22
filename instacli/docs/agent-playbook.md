# InstaCLI Agent Playbook

Use this playbook when another AI agent is operating InstaCLI.

## Golden rules
- Always run with `--json --quiet`.
- Never publish automatically from AI suggestions unless explicitly requested.
- Validate auth first.

## Quick preflight
```bash
ig auth status --json --quiet
ig media list --limit 1 --json --quiet
```

If `AUTH_REQUIRED`, run setup/login before doing anything else.

## Daily engagement loop

### 1) Pull unresolved comments
```bash
ig comments inbox --days 7 --limit 20 --json --quiet
```

### 2) Generate reply options
```bash
ig comments reply --ai --text "<comment text>" --json --quiet
```

### 3) Post approved reply
```bash
ig comments reply --comment <comment_id> --text "<approved reply>" --json --quiet
```

## Analytics loop

### Weekly snapshot
```bash
ig analytics summary --days 7 --json --quiet
```

### Monthly snapshot
```bash
ig analytics summary --days 30 --json --quiet
```

### Top posts ranking
```bash
ig analytics top-posts --days 30 --limit 10 --json --quiet
```

## Account-scoped local namespace
If multiple operators share the same host, isolate configs by account namespace:
```bash
ig comments inbox --account pessoal --json --quiet
ig analytics summary --account maia --days 7 --json --quiet
```

## Safety checklist before publish
- Correct `comment_id` / media target
- Reply text approved
- Command includes `--json --quiet`
- Dry-run used when available

## Failure handling
- `AUTH_REQUIRED`: re-run setup/login.
- `PROVIDER_ERROR` + Meta 400: capture error body and retry with narrower query.
- Empty inbox: return success with zero items, do not force extra actions.
