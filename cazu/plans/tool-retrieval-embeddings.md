# Tool Retrieval via Embeddings (Hybrid with Safe Fallback)

## Problem

The namespace keyword filter (current implementation) has two limitations:
1. Requires maintaining a manual PT-BR keyword list per namespace
2. Fails for messages that don't use expected vocabulary
   ("quanto meu cliente me deve?" doesn't contain "receber" but implies finance.list_receivables)

At the same time, keyword routing is fast, local, and robust when external APIs fail.

## Recommended Approach

Use a **hybrid strategy**:
- Embeddings-based retrieval as primary candidate generator
- Keep the current namespace/follow-up keyword logic as fallback and safety net
- Keep companion/lookup tools inclusion rules

This gives semantic recall gains without sacrificing reliability.

## Implementation

### 1) Build a tool embedding index at startup (degraded-mode safe)

Create `Cazu.LLM.ToolIndex` (GenServer) and start it in supervision tree.

Responsibilities:
- Load supported tools
- Build text representation per tool (name + description + parameters/aliases)
- Request embeddings in batch
- Keep index in memory
- Expose retrieval API
- If startup embedding fails, keep server running in degraded mode (`index: nil`)

```elixir
defmodule Cazu.LLM.ToolIndex do
  use GenServer

  def start_link(_), do: GenServer.start_link(__MODULE__, [], name: __MODULE__)

  def init(_) do
    {:ok, %{index: nil, status: :building}, {:continue, :build_index}}
  end

  def handle_continue(:build_index, state) do
    new_state =
      case build_index() do
        {:ok, index} -> %{state | index: index, status: :ready}
        {:error, _} -> %{state | index: nil, status: :degraded}
      end

    {:noreply, new_state}
  end

  def retrieve(user_text, opts \\ []) do
    GenServer.call(__MODULE__, {:retrieve, user_text, opts})
  end
end
```

### 2) Retrieve tools per turn with threshold + fallback

In `Cazu.LLM.OpenAIResponses.select_tools_for_turn/3`:

1. If `opts[:tools]` is provided, keep current explicit filtering behavior
2. If embeddings retrieval disabled by config, use existing keyword strategy
3. Try `ToolIndex.retrieve(user_text, top_k: k, min_similarity: threshold)`
4. If retrieval fails/empty/low confidence, fallback to keyword strategy
5. Expand with companion namespaces/tools
6. For short follow-ups (`sim`, `pode`, etc.), preserve previous namespace continuity

```elixir
defp select_tools_for_turn(%Conversation{} = conversation, user_text, opts) do
  case Keyword.get(opts, :tools) do
    tools when is_list(tools) -> filter_explicit_tools(tools)
    _ ->
      if embeddings_enabled?() do
        case Cazu.LLM.ToolIndex.retrieve(user_text, top_k: 12, min_similarity: 0.28) do
          {:ok, tools} when tools != [] ->
            tools
            |> maybe_apply_follow_up_namespace(conversation, user_text)
            |> ensure_companion_tools()

          _ ->
            filter_tools_by_namespace(Tools.supported_tools(), conversation, user_text)
        end
      else
        filter_tools_by_namespace(Tools.supported_tools(), conversation, user_text)
      end
  end
end
```

### 3) Embedding API call

Use OpenAI `text-embedding-3-small`:
- Fast and low cost
- Compatible with existing `Req`
- No new dependency required

## Confidence & Safety Rules

### A) Minimum similarity threshold

Do not trust top-K blindly. If all candidates are weak, fallback to keyword strategy.

Suggested starting values:
- `top_k`: 12
- `min_similarity`: 0.25–0.32 (tune via logs)

### B) Companion/lookup tools are still required

After retrieval, always apply companion expansion rules (namespace-level or tool-level), e.g.:
- finance ⇒ include CRM lookup tools when needed
- sales/service ⇒ include CRM context tools

### C) Follow-up continuity

For short confirmations (`sim`, `pode lançar`, `tenta novamente`), preserve current behavior:
- prioritize last used namespace/tools from conversation context
- do not restart broad retrieval blindly

## Failure Modes (must be handled)

1. Embedding API timeout/error
   - Return `{:error, reason}` from ToolIndex and fallback immediately
2. Index unavailable/degraded startup
   - Continue app boot; use keyword routing
3. No candidate above threshold
   - Fallback to keyword routing
4. Empty supported tools list
   - Keep current `:no_tools_available` behavior

## Config

Add retrieval config in `config/*.exs` (names illustrative):

```elixir
config :cazu, :tool_retrieval,
  strategy: :hybrid,            # :keyword | :embeddings | :hybrid
  embeddings_enabled: true,
  embedding_model: "text-embedding-3-small",
  top_k: 12,
  min_similarity: 0.28,
  embedding_timeout_ms: 3_000
```

## Rollout Plan

### Phase 1 (safe introduction)
- Implement ToolIndex + hybrid path behind config flag
- Keep keyword as default strategy in production
- Add logs/metrics for retrieval quality

### Phase 2 (observability-driven tuning)
- Compare:
  - retrieved candidates
  - selected tool
  - execution success/failure
  - fallback frequency
- Tune `top_k` and `min_similarity`

### Phase 3 (optional default switch)
- If metrics show better precision/recall and stable latency,
  set `:hybrid` or `:embeddings` as default
- Keep keyword fallback permanently for resilience

## Observability

Add structured logs/telemetry fields:
- `retrieval_strategy` (`keyword`, `embeddings`, `hybrid`)
- `embedding_latency_ms`
- `top_similarity`
- `candidate_count`
- `fallback_used?`
- `fallback_reason` (`timeout`, `low_confidence`, `degraded_index`, etc.)

These logs are essential for threshold tuning and confidence in rollout.

## Trade-offs vs current keyword-only filter

| | Keyword filter | Hybrid (Embeddings + Fallback) |
|---|---|---|
| PT-BR maintenance | Manual keyword lists | Reduced (still useful as fallback) |
| Semantic understanding | Limited | Strong |
| Latency added | ~0ms | ~60–120ms (embedding call path) |
| Cost added | $0 | Very low per turn |
| Reliability without API | Excellent | Excellent (fallback) |
| Implementation complexity | Low | Medium |

## Dependencies

No new Elixir deps needed.
Use existing `Req` for embedding API calls.

(Alternative: local embeddings via Nx/Bumblebee for API independence, at higher memory/startup cost.)

## Open Questions & Risks

### 1. Tool text representation is underdefined
The plan says "name + description + parameters/aliases" but the exact string embedded per tool
matters a lot for retrieval quality. Needs to be specified before implementation:
- Does it include parameter names? Example values? PT-BR aliases?
- Consistent format across all tools is required for comparable embeddings.

**Acceptance criteria:**
- Define one canonical template for tool embedding text.
- Include stable fields only (tool name, description, parameter names, key aliases).
- Re-index results remain deterministic for unchanged tool specs.

### 2. `min_similarity: 0.28` is a starting guess
Treat thresholds as experiments, not fixed truths. Start with at least two candidates
(e.g. **0.20** and **0.28**) and compare with logs before locking a default.
Missing the correct tool (false negative) is often worse than returning a few extra tools
(false positive), but this must be validated with observed execution outcomes.

**Acceptance criteria:**
- Threshold decision is based on staging/prod telemetry (not intuition only).
- Track fallback rate and wrong-tool rate by threshold candidate.
- Choose threshold with best precision/recall trade-off for real traffic.

### 3. GenServer for a read-only index may become a bottleneck
After startup the index is never mutated. Under high concurrency, all retrieve calls
serialize through a single GenServer process. Consider migrating to an ETS table
(write once at startup, concurrent reads) if throughput becomes an issue.
GenServer is fine for now.

**Acceptance criteria:**
- Monitor retrieval call queue/latency under load.
- If bottleneck appears, move read path to ETS while keeping supervised rebuild logic.

### 4. Per-turn latency is real
60–120ms embedding API call added on top of the LLM call is noticeable on Telegram.
Measure in staging before promoting hybrid to default strategy.
If latency is unacceptable, consider local embeddings (Nx/Bumblebee) or caching
embeddings of repeated short phrases.

**Acceptance criteria:**
- Define and monitor latency SLOs (example: retrieval p95 < 120ms, p99 < 250ms).
- Promotion to default requires SLO compliance for a sustained window.

### 5. Semantic drift after tool/spec updates
When tool descriptions, aliases, or parameter sets change, embeddings can become stale
and retrieval quality may silently degrade.

**Acceptance criteria:**
- Trigger index rebuild on startup and on explicit refresh.
- Ensure operational runbook includes "rebuild index" after significant tool spec changes.
- Add at least one test confirming rebuild picks up updated tool text.

## Concrete Implementation Checklist (File-by-File)

### 0) Prep / Baseline

- [ ] Capture current baseline from logs/tests (tool selection success rate, fallback/no-tool frequency)
- [ ] Keep existing keyword route fully intact until hybrid path is validated

### 1) New Tool Index Module

**Create:** `lib/cazu/llm/tool_index.ex`

- [ ] Add `Cazu.LLM.ToolIndex` GenServer with state:
  - `index` (tool -> vector),
  - `status` (`:building | :ready | :degraded`),
  - `last_error` (optional)
- [ ] Build index in `handle_continue/2` so app boot is non-blocking
- [ ] Add public API:
  - `retrieve(user_text, opts \\ [])`
  - optional `status/0` for diagnostics
- [ ] Implement embedding client with `Req` to `POST /embeddings`
- [ ] Implement cosine similarity + top-k selection
- [ ] Enforce `min_similarity`; return `{:error, :low_confidence}` when needed
- [ ] Add graceful failure returns (`{:error, :unavailable}` / `{:error, :timeout}` / etc.)
- [ ] Use `AgentTrace.log/2` for structured retrieval diagnostics

### 2) Wire into Supervision Tree

**Edit:** `lib/cazu/application.ex`

- [ ] Add `Cazu.LLM.ToolIndex` child before endpoint (or alongside other long-lived services)
- [ ] Ensure startup continues even if ToolIndex enters degraded mode

### 3) Retrieval Config

**Edit:** `config/config.exs`

- [ ] Add defaults under `:tool_retrieval`:
  - `strategy`, `embeddings_enabled`, `embedding_model`, `top_k`, `min_similarity`, `embedding_timeout_ms`

**Edit:** `config/runtime.exs`

- [ ] Add env-driven overrides (safe parsing for integers/floats/bools)
- [ ] Keep sane defaults when env vars are missing/invalid

Suggested env names:
- `TOOL_RETRIEVAL_STRATEGY`
- `TOOL_RETRIEVAL_EMBEDDINGS_ENABLED`
- `TOOL_RETRIEVAL_TOP_K`
- `TOOL_RETRIEVAL_MIN_SIMILARITY`
- `TOOL_RETRIEVAL_TIMEOUT_MS`
- `OPENAI_EMBEDDING_MODEL`
- `TOOL_TEXT_CONTEXT` (optional override for canary/rebuild checks)
- `TOOL_TEXT_VERSION` (optional text-template version)

### 4) Integrate Hybrid Selection into OpenAI Router

**Edit:** `lib/cazu/llm/openai_responses.ex`

- [ ] Refactor `select_tools_for_turn/3` into explicit branches:
  1. explicit `opts[:tools]`
  2. keyword-only strategy
  3. embeddings-only strategy
  4. hybrid strategy
- [ ] Add helper for explicit tool filtering (avoid duplicate code)
- [ ] Call `Cazu.LLM.ToolIndex.retrieve/2` when embeddings path is active
- [ ] If retrieval fails/empty/low-confidence, fallback to current `filter_tools_by_namespace/3`
- [ ] Preserve follow-up continuity logic (`last_used_namespace` for short confirmations)
- [ ] Apply companion expansion after retrieval/fallback
- [ ] Add `AgentTrace.log/2` with:
  - strategy used
  - candidate count
  - top similarity (if available)
  - fallback reason

### 5) Keep Keyword Path as Permanent Safety Net

**Edit:** `lib/cazu/llm/openai_responses.ex`

- [ ] Keep keyword matcher available regardless of selected default strategy
- [ ] If desired, improve keyword matching to token-based checks (avoid substring false positives)

### 6) Tests: Tool Index

**Create:** `test/cazu/llm/tool_index_test.exs`

- [ ] Builds index successfully from stubbed embeddings API
- [ ] Returns top-k candidates by similarity
- [ ] Applies `min_similarity` threshold
- [ ] Handles timeout/error and returns fallback-friendly errors
- [ ] Degraded mode behaves predictably (`index: nil`)

### 7) Tests: OpenAIResponses Hybrid Routing

**Edit:** `test/cazu/llm/openai_responses_test.exs`

- [ ] `opts[:tools]` still has highest priority
- [ ] Hybrid strategy uses embeddings candidates when confident
- [ ] Hybrid strategy falls back to keyword routing on retrieval failure
- [ ] Short follow-up keeps prior namespace continuity
- [ ] Companion expansion is applied for embeddings-derived namespaces/tools
- [ ] No regression in existing request body behavior (`previous_response_id`, instructions, etc.)

### 8) Optional Test Helpers

**Edit (if needed):** `test/support/test_http_stub.ex`

- [ ] Support assertions for `/embeddings` requests and payload shape
- [ ] Keep reusable helpers for both `/responses` and `/embeddings`

### 9) Operational Visibility

**Edit:** `lib/cazu/agent_trace.ex` (only if new sanitization keys/fields are needed)

- [ ] Ensure retrieval diagnostics are logged consistently
- [ ] Avoid leaking secrets in new logging fields

### 10) Rollout Steps

- [ ] Enable strategy in dev/test first (`:hybrid`)
- [ ] Tune threshold (`min_similarity`) based on fallback frequency and wrong-tool rate
- [ ] Promote to staging/prod after stability checks
- [ ] Keep keyword fallback permanently enabled

### 11) Current Implementation Status (this branch)

- [x] Added `Cazu.LLM.ToolIndex` GenServer (`lib/cazu/llm/tool_index.ex`)
- [x] Added startup supervision wiring (`lib/cazu/application.ex`)
- [x] Added retrieval config defaults/runtime env parsing (`config/config.exs`, `config/runtime.exs`)
- [x] Integrated hybrid/embeddings fallback flow in `select_tools_for_turn/3`
- [x] Added retrieval diagnostics with `AgentTrace.log/2`
- [x] Improved keyword matcher to token-based checks
- [x] Added canonical tool text template for index entries (deterministic fields + ordering)
- [x] Added index signature tracking (`:signature`) and deterministic rebuild assertions
- [x] Added ToolIndex tests, including deterministic rebuild + context-drift test
- [x] Added tests for hybrid/tool routing in `OpenAIResponses`
- [ ] Run threshold tuning experiment (`0.20` vs `0.28`) on traffic
- [ ] Run full local validation (`mix format`, `mix test`, `mix precommit`)

### 12) Verification Commands

- [ ] `mix format`
- [ ] `mix test test/cazu/llm/tool_index_test.exs`
- [ ] `mix test test/cazu/llm/openai_responses_test.exs`
- [ ] `mix test`
- [ ] `mix precommit`
