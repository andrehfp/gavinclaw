# 003 - Tool Call Audit and Fix Plan

## Goal
Run every registered tool handler the same way the agent invokes tools (`Cazu.Tools.run/3`), capture failures, and define a fix plan.

## Audit executed
Command used:

```bash
mix run -e '
context = %{integration: nil, idempotency_key: "probe", tenant_id: nil}
Cazu.Tools.supported_tools()
|> Enum.each(fn tool ->
  result =
    try do
      Cazu.Tools.run(tool, %{}, context)
    rescue
      e -> {:raised, Exception.format(:error, e, __STACKTRACE__)}
    catch
      kind, value -> {:thrown, {kind, value}}
    end

  IO.puts("=== #{tool} ===")
  IO.inspect(result, pretty: true, limit: :infinity)
end)
'
```

Also saved machine-readable output to:

- `tmp/tool_call_audit.json`

## Findings
Total tools audited: **41**

- `raised`: **0**
- `thrown`: **0**
- `error`: **41**

Error groups:

1. `:reauth_required` (24 tools)
   - Affected groups: charge, crm, finance, inventory, invoice, service
   - Root cause in this run: context had `integration: nil`

2. `{:missing_required_argument, ...}` (17 tools)
   - Affected tools: mostly `get/delete/update/create` operations requiring IDs or required payload fields
   - Root cause in this run: empty argument map (`%{}`)

## Interpretation
No runtime crashes were found in tool dispatch or handler execution under this probe. Failures are currently dominated by:

- missing integration auth context
- missing required tool arguments

These are expected in the current invocation mode, but they still surface as hard failures and can lead to poor UX/retries if not handled pre-flight.

## Fix plan

### Phase 1 — Pre-flight guardrails before enqueue/execute
1. Add a centralized **tool preflight** step before enqueueing `ToolExecutionWorker`:
   - validate integration availability for integration-backed tools
   - validate required arguments against tool spec (`Cazu.Tools.Specs.spec_for/1` required fields)
2. If preflight fails:
   - do not enqueue tool execution
   - return a user-facing clarification message (missing fields) or reconnect message (reauth)

**Acceptance criteria**
- Agent no longer enqueues doomed jobs when integration is missing.
- Missing required args trigger clarification response, not worker retries.

### Phase 2 — Error taxonomy normalization
1. Normalize tool errors into a small set:
   - `:reauth_required`
   - `{:missing_required_argument, field}`
   - `{:invalid_argument, field}`
   - `{:transient, reason}`
   - `{:unexpected, reason}`
2. Update failure handling in `Cazu.Workers.ToolExecutionWorker` to map consistently to UX actions.

**Acceptance criteria**
- Logs and user messages become deterministic by error type.
- Retry policy applies only to transient errors.

### Phase 3 — Full-tool smoke suite with HTTP stub
1. Create an integration-style smoke test that iterates over `Cazu.Tools.supported_tools/0`.
2. For each tool:
   - build a minimal valid payload fixture
   - execute against local stubbed Conta Azul API
   - assert no raises and expected request shape
3. Keep this in CI as regression protection.

**Acceptance criteria**
- CI fails if any tool starts crashing on invocation.
- Query/body encoding regressions are caught automatically.

### Phase 4 — Operational cleanup for already-stuck records
1. Add an admin/maintenance task to reconcile stale `running` jobs/tool_calls older than threshold.
2. Mark as failed with normalized reason and notify conversation state when needed.

**Acceptance criteria**
- No long-lived `running` rows without corresponding active oban job.

## Suggested implementation order
1. Phase 1 (highest impact, blocks bad retries)
2. Phase 2 (stabilizes behavior)
3. Phase 3 (prevents regressions)
4. Phase 4 (cleanup/ops hardening)

## Notes
- This audit intentionally used `%{}` args and `integration: nil` to simulate worst-case tool invocation.
- A second pass should be executed with fixture-based valid args + stubbed API after Phase 3 is in place.
