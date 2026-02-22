# MoE Plan for Spark (Local-First Intelligence)

This document captures the proposed Mixture-of-Experts (MoE)-inspired routing design for Spark's local LLM upgrade, plus the retrieval pipeline flow. It is intentionally implementation-ready while keeping the system optional so Spark continues to work with minimal or no local AI by default.

## Goals
- Preserve Spark's current rules-based intelligence as the default.
- Add optional local LLMs via Ollama for better relevance, quality gating, and reasoning.
- Keep all computation local (no API calls, no cloud).
- Provide graceful degradation when models are missing or Ollama is unavailable.

## Spark Intelligence Features (Summary)
1. Semantic Reranking
2. Meta-Ralph Quality Gate
3. Memory Capture Scoring
4. Chip Trigger Detection
5. Causal Extraction
6. EIDOS Assessment
7. Prediction Generation

## Model Tiers (Qwen3 Family)
### Tier 1 (Retrieval)
- Embeddings: `qwen3-embedding:4b`
- Reranker: `Qwen3-Reranker-0.6B`

### Tier 2 (Classification)
- `qwen3:4b` for quality gates, capture scoring, triggers
- Thinking mode OFF for speed (structured outputs)

### Tier 3 (Reasoning)
- `qwen3:8b` for causal extraction, EIDOS, predictions
- Thinking mode ON for multi-step reasoning

### Premium Optional
- `qwen3:30b-a3b` (MoE). Uses only 3B active params per token.
- Only for high VRAM / large unified memory systems.

## Router Architecture (Software-Level MoE)
The router is a thin layer between Spark features and the local LLM runtime (Ollama). It decides:
- which model to use
- whether to enable thinking mode
- how to fallback when a model is unavailable

### Inputs
- Request type (feature ID)
- Payload (query, candidates, transcript, etc.)
- Latency budget
- User tier (base vs premium)
- LLM availability

### Outputs
- Model selection
- Mode (thinking on/off)
- Structured response

## Request Classification
### Primary Path (Deterministic)
If a feature ID is provided, route directly:
- `semantic_rerank` -> `rerank`
- `meta_ralph_quality_gate` -> `classify`
- `memory_capture_scoring` -> `classify_realtime`
- `chip_trigger_detection` -> `semantic_match`
- `causal_extraction` -> `reasoning_extract`
- `eidos_assessment` -> `reasoning_assess`
- `prediction_generation` -> `reasoning_predict`
- `embed_memory` or `embed_query` -> `embed`

### Secondary Path (Heuristic Classifier)
If feature ID is unknown:
- `query + candidates[]` -> `rerank`
- asks for `score` / `yes_no` -> `classify`
- asks for causes, steps, risks, plan -> `reasoning_*`

### Rules-Only Fallback
If no local models are available, route to rules engine.

## Model Selection Matrix
| Capability | Preferred | Thinking | Fallback 1 | Fallback 2 | Final |
|---|---|---|---|---|---|
| embed | `qwen3-embedding:4b` | n/a | TF-IDF | - | rules |
| rerank | `Qwen3-Reranker-0.6B` | n/a | `qwen3:4b` scorer | cosine | rules |
| classify | `qwen3:4b` | OFF | `qwen3:8b` OFF | rules | rules |
| classify_realtime | `qwen3:4b` | OFF | rules | - | rules |
| semantic_match | `qwen3:4b` | OFF | embed+cosine | rules | rules |
| reasoning_extract | `qwen3:8b` | ON | `qwen3:4b` ON | rules | rules |
| reasoning_assess | `qwen3:8b` | ON | `qwen3:4b` ON | rules | rules |
| reasoning_predict | `qwen3:8b` | ON | `qwen3:4b` ON | rules | rules |
| premium_reasoning | `qwen3:30b-a3b` | ON | `qwen3:8b` ON | `qwen3:4b` ON | rules |

## Thinking Mode Rules
- OFF for fast, structured classification tasks.
- ON for multi-step reasoning tasks (causal extraction, EIDOS, prediction).

## Router Strategy Prompts
All router prompts should return strict JSON with no extra text. The router injects task metadata and enforces thinking mode. Use short, deterministic instructions and avoid chain-of-thought in outputs.

### Template: Classification (Fast Gate)
Use for Meta-Ralph quality gate, memory capture scoring, chip trigger detection.
```
SYSTEM:
You are a strict JSON classifier. Return only JSON. No extra text.

USER:
Task: {{task_name}}
Question: {{question}}
Input:
{{input}}

Return JSON:
{
  "label": "yes|no",
  "score": 0.0-1.0,
  "reason": "short, 1 sentence"
}
```

### Template: Rerank Fallback (Chat Model Scorer)
Use when the dedicated reranker model is missing.
```
SYSTEM:
You score relevance between a query and candidate text. Return only JSON.

USER:
Query: {{query}}
Candidate: {{candidate}}

Return JSON:
{
  "score": 0.0-1.0
}
```

### Template: Causal Extraction
Use for cause-and-effect chains from transcripts.
```
SYSTEM:
Extract concise cause-effect chains. Return only JSON. No extra text.

USER:
Transcript:
{{transcript}}

Return JSON:
{
  "chains": [
    {
      "cause": "short clause",
      "effect": "short clause",
      "evidence": "short quote or summary"
    }
  ]
}
```

### Template: EIDOS Assessment
Use for project state, blockers, risk, and next steps.
```
SYSTEM:
Assess project state. Return only JSON. No extra text.

USER:
Context:
{{context}}

Return JSON:
{
  "goal": "short",
  "blockers": ["short", "short"],
  "risks": ["short", "short"],
  "next_steps": ["short", "short"]
}
```

### Template: Prediction Generation
Use for likely issues or needs based on prior patterns.
```
SYSTEM:
Predict likely issues or needs. Return only JSON. No extra text.

USER:
History:
{{history}}
Current task:
{{task}}

Return JSON:
{
  "predictions": [
    {
      "issue": "short",
      "likelihood": 0.0-1.0,
      "mitigation": "short"
    }
  ]
}
```

## Fallback Strategy
### Per Request
1. Try preferred model.
2. If missing/unavailable, walk fallback chain.
3. If all fail, use rules-based engine.

### Per Session
- If Ollama missing at startup, run rules-only.
- If Ollama becomes available later, re-enable LLM paths.

## Concurrency and Model Management
- Keep a configurable max loaded models count.
- Preload small models if available.
- Keep-alive frequently used models.
- Reasoning calls should be serialized or capped (1 at a time).

Example default limits:
- Embedding: 4 parallel
- Rerank: 2 parallel
- Classification: 2 parallel
- Reasoning: 1 parallel

## Retrieval Pipeline Flow
1. Embed query (`qwen3-embedding:4b`, fallback TF-IDF)
2. Vector search (top K)
3. Fast filters (stale/duplicate/low confidence)
4. Rerank (`Qwen3-Reranker-0.6B`, fallback `qwen3:4b` scorer)
5. Chip trigger detection (semantic)
6. Score fusion
7. Assemble context to inject
8. Optional quality gate on auto-curated memories

### Score Fusion Example
```
final_score =
  0.55 * rerank_score +
  0.25 * vector_score +
  0.10 * recency_boost +
  0.10 * pin_or_trigger_boost
```

## Rollout Plan (Minimal AI First)
Phase 1: Rules-only baseline
- Keep current behavior as default.
- Ensure all features work without local AI.

Phase 2: Local AI opt-in
- Detect Ollama and available models.
- Offer "enable local AI" setup path.
- Use router with fallbacks to keep reliability.

Phase 3: Premium MoE option
- Detect `qwen3:30b-a3b`.
- Route premium reasoning requests to MoE model.

## Notes
- This design is intentionally model-agnostic at the router layer, but optimized for Qwen3.
- Qwen3 thinking mode should be controlled by the router, not feature code.
- The router is a software-level MoE, not a model-level MoE.
