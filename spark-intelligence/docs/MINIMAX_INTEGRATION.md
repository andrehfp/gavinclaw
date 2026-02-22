# MiniMax M2.5 Integration Guide

> How Spark Intelligence uses MiniMax M2.5, and how to use it as a subagent in any test or pipeline.

**Last updated:** 2026-02-18

---

## Quick Start

### 1. Verify Your Setup

```bash
python -c "
import os; from dotenv import load_dotenv; load_dotenv()
key = os.getenv('MINIMAX_API_KEY', '')
print(f'API Key: {\"SET (\" + key[:12] + \"...)\" if key else \"MISSING\"}\')
"
```

### 2. Make a Call (30 seconds)

```python
import os, re, httpx
from dotenv import load_dotenv
load_dotenv()

THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

resp = httpx.post(
    "https://api.minimax.io/v1/chat/completions",
    headers={
        "Authorization": f"Bearer {os.environ['MINIMAX_API_KEY']}",
        "Content-Type": "application/json",
    },
    json={
        "model": "MiniMax-M2.5",
        "messages": [{"role": "user", "content": "Say hello in one sentence."}],
        "max_tokens": 1500,
        "temperature": 0.3,
    },
    timeout=15,
)

data = resp.json()
raw = data["choices"][0]["message"]["content"]
clean = THINK_RE.sub("", raw).strip()
print(clean)
```

### 3. Use via Anthropic SDK

```python
import anthropic

client = anthropic.Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key=os.environ["MINIMAX_API_KEY"],
)

msg = client.messages.create(
    model="MiniMax-M2.5",
    max_tokens=1500,
    messages=[{"role": "user", "content": "Hello from Spark"}],
)

# msg.content may contain ThinkingBlock + TextBlock
for block in msg.content:
    if block.type == "text":
        print(block.text)
```

---

## Architecture Overview

MiniMax M2.5 is integrated into 4 Spark subsystems via the **OpenAI-compatible** chat completions API:

```
                         +-------------------+
                         |  MiniMax M2.5 API |
                         | api.minimax.io/v1 |
                         +--------+----------+
                                  |
                    POST /chat/completions
                    Bearer {MINIMAX_API_KEY}
                                  |
          +-----------+-----------+-----------+-----------+
          |           |           |           |           |
   Advisory      Effect      Opportunity    DEPTH
   Synthesizer   Evaluator   Scanner        Trainer
   (synthesis)   (scoring)   (discovery)    (training)
```

### Two Compatible Endpoints

| Endpoint | URL | SDK | Use Case |
|----------|-----|-----|----------|
| **OpenAI-compat** | `https://api.minimax.io/v1/chat/completions` | Raw HTTP / OpenAI SDK | All current Spark integrations |
| **Anthropic-compat** | `https://api.minimax.io/anthropic` | Anthropic SDK | External tools, Claude Code, testing |

Both use the same API key. The OpenAI endpoint returns `<think>...</think>` inline; the Anthropic endpoint separates thinking into typed blocks.

---

## M2.5 Extended Thinking: Critical Details

MiniMax M2.5 **always thinks before responding**. This has direct implications for every integration:

### Token Budget

```
max_tokens = thinking_tokens + response_tokens
```

- Thinking consumes **100-1500 tokens** depending on prompt complexity
- If `max_tokens` is too low, thinking eats the entire budget and the response is **empty**

| max_tokens | Thinking | Response | Result |
|------------|----------|----------|--------|
| 200 | 200 | 0 | Empty response |
| 500 | 450 | 50 | Truncated |
| 1500 | 300 | 1200 | Good |
| 4096 | 1000 | 3096 | Full |

**Rule of thumb:** Set `max_tokens >= 1500` for any MiniMax M2.5 call.

### Think Block Stripping

The OpenAI-compat endpoint embeds thinking in `<think>...</think>` tags within the response content. You **must** strip these:

```python
import re
THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)

def strip_think(text: str) -> str:
    return THINK_RE.sub("", text).strip()
```

### Timeout Requirements

Thinking adds 3-15 seconds of latency. Minimum recommended timeouts:

| Call Type | Minimum Timeout | Recommended |
|-----------|----------------|-------------|
| Simple prompt | 8s | 10s |
| JSON extraction | 10s | 15s |
| Complex reasoning | 15s | 20s |
| DEPTH training | 90s + depth*8 | As-is |

---

## Environment Variables

### Required

| Variable | Value | Description |
|----------|-------|-------------|
| `MINIMAX_API_KEY` | `sk-cp-...` | API key from [MiniMax Platform](https://platform.minimax.io/user-center/basic-information/interface-key) |

### Optional (with defaults)

| Variable | Default | Description |
|----------|---------|-------------|
| `SPARK_MINIMAX_BASE_URL` | `https://api.minimax.io/v1` | OpenAI-compat base URL |
| `SPARK_MINIMAX_MODEL` | `MiniMax-M2.5` | Model ID |
| `SPARK_SYNTH_PREFERRED_PROVIDER` | `""` | Set to `minimax` to prioritize |
| `SPARK_SYNTH_TIMEOUT` | `8.0` | Advisory synthesizer timeout (seconds) |
| `AUTO_SCORER_MINIMAX_TIMEOUT_S` | `15` | Effect evaluator timeout (seconds) |
| `SPARK_OPPORTUNITY_LLM_PROVIDER` | `""` | Set to `minimax` for opportunity scanning |
| `SPARK_OPPORTUNITY_LLM_TIMEOUT_S` | `12` | Opportunity scanner timeout (seconds) |
| `DEPTH_ANSWER_PROVIDER` | `deepseek` | Set to `minimax` for DEPTH training |
| `DEPTH_MINIMAX_ENDPOINT` | `https://api.minimax.io/v1/chat/completions` | DEPTH endpoint |
| `DEPTH_MINIMAX_MODEL` | `MiniMax-M2.5` | DEPTH model |

### Current `.env` Configuration

```env
MINIMAX_API_KEY=sk-cp-...
SPARK_MINIMAX_BASE_URL=https://api.minimax.io/v1
SPARK_MINIMAX_MODEL=MiniMax-M2.5
SPARK_SYNTH_PREFERRED_PROVIDER=minimax
DEPTH_ANSWER_PROVIDER=minimax
DEPTH_MINIMAX_ENDPOINT=https://api.minimax.io/v1/chat/completions
DEPTH_MINIMAX_MODEL=MiniMax-M2.5
SPARK_OPPORTUNITY_LLM_ENABLED=1
SPARK_OPPORTUNITY_LLM_PROVIDER=minimax
```

---

## Tuneables (Runtime Configuration)

File: `~/.spark/tuneables.json`

These override environment defaults at runtime and are hot-reloaded:

```json
{
  "synthesizer": {
    "ai_timeout_s": 10.0,
    "preferred_provider": "minimax",
    "minimax_model": "MiniMax-M2.5"
  },
  "advisory_engine": {
    "force_programmatic_synth": false
  },
  "advisory_quality": {
    "ai_timeout_s": 15.0
  }
}
```

**Warning:** If `force_programmatic_synth` is `true`, all AI synthesis (including MiniMax) is bypassed. Set to `false` to enable MiniMax.

---

## Integration Points

### 1. Advisory Synthesizer

**File:** `lib/advisory_synthesizer.py` | **Function:** `_query_minimax()` (line 691)

Generates natural-language advisory summaries from structured data.

```python
# Internal call pattern:
_query_minimax(prompt)
# → POST https://api.minimax.io/v1/chat/completions
# → max_tokens: 2000 (json) / 1500 (text)
# → temperature: 0.2 (json) / 0.3 (text)
# → timeout: AI_TIMEOUT_S (default 8.0s, tunable)
```

**Provider chain position:** 4th (after Ollama, Gemini, then MiniMax). Override with `SPARK_SYNTH_PREFERRED_PROVIDER=minimax` to make it primary.

**Fallback chain:**
```
preferred_provider → ollama → gemini → minimax → openai → anthropic
```

### 2. Effect Evaluator

**File:** `lib/effect_evaluator.py` | **Function:** `_minimax_effect()` (line 36)

Classifies advisory outcomes as positive/neutral/negative with confidence scores.

```python
# Called by:
evaluate_effect(advisory, match, use_minimax=True)

# Returns:
{"effect": "positive", "confidence": 0.95, "reason": "..."}
```

**Trigger:** Opt-in only. Pass `use_minimax=True` to enable MiniMax-powered effect evaluation.

### 3. Opportunity Scanner

**File:** `lib/opportunity_scanner.py`

Discovers learning opportunities from event context using LLM analysis.

```python
# Configured via:
SPARK_OPPORTUNITY_LLM_PROVIDER=minimax
SPARK_OPPORTUNITY_LLM_ENABLED=1

# Special handling:
# - 12s minimum timeout for MiniMax (vs 2.5s base)
# - <think> block stripping in _extract_json_candidate()
# - Retry with shorter prompt if think block exhausts token budget
```

### 4. DEPTH Trainer

**File:** `lib/depth_trainer.py`

Generates answers for DEPTH training sessions (engineering reasoning).

```python
# Configured via:
DEPTH_ANSWER_PROVIDER=minimax

# Call pattern:
# → POST https://api.minimax.io/v1/chat/completions
# → max_tokens: 4096
# → temperature: 0.7
# → timeout: 90 + depth * 8 seconds
```

---

## Using MiniMax as a Subagent in Tests

### Pattern 1: Direct HTTP Call (Recommended)

The simplest way to use MiniMax in any test or script:

```python
"""Use MiniMax M2.5 as a subagent for any task."""

import os, re, httpx
from dotenv import load_dotenv

load_dotenv()

THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
API_KEY = os.environ["MINIMAX_API_KEY"]
BASE_URL = os.getenv("SPARK_MINIMAX_BASE_URL", "https://api.minimax.io/v1").rstrip("/")
MODEL = os.getenv("SPARK_MINIMAX_MODEL", "MiniMax-M2.5")


def ask_minimax(
    prompt: str,
    *,
    max_tokens: int = 1500,
    temperature: float = 0.3,
    timeout: float = 15.0,
    json_mode: bool = False,
) -> str:
    """Send a prompt to MiniMax M2.5 and return the clean response."""
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    with httpx.Client(timeout=timeout) as client:
        resp = client.post(
            f"{BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    return THINK_RE.sub("", content).strip()


# Usage:
answer = ask_minimax("Explain rate limiting in 2 sentences.")
print(answer)

# JSON mode:
import json
result = ask_minimax(
    "Return JSON: {\"score\": <1-10>, \"reason\": \"...\"}",
    json_mode=True,
    max_tokens=2000,
)
parsed = json.loads(result)
```

### Pattern 2: Async Subagent

For async pipelines (like DEPTH training):

```python
import os, re, httpx
from dotenv import load_dotenv

load_dotenv()

THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


async def ask_minimax_async(
    prompt: str,
    *,
    max_tokens: int = 1500,
    temperature: float = 0.3,
    timeout: float = 15.0,
) -> str:
    """Async MiniMax M2.5 call."""
    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            "https://api.minimax.io/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.environ['MINIMAX_API_KEY']}",
                "Content-Type": "application/json",
            },
            json={
                "model": "MiniMax-M2.5",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    return THINK_RE.sub("", content).strip()
```

### Pattern 3: Anthropic SDK (For Testing / Claude Code)

When you want typed responses with separate thinking blocks:

```python
import os
import anthropic
from dotenv import load_dotenv

load_dotenv()

client = anthropic.Anthropic(
    base_url="https://api.minimax.io/anthropic",
    api_key=os.environ["MINIMAX_API_KEY"],
)


def ask_minimax_anthropic(prompt: str, max_tokens: int = 1500) -> str:
    """MiniMax via Anthropic SDK - thinking handled automatically."""
    msg = client.messages.create(
        model="MiniMax-M2.5",
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    # Extract text blocks only (skip ThinkingBlock)
    return "\n".join(b.text for b in msg.content if b.type == "text").strip()
```

### Pattern 4: Scoring Subagent (JSON Extraction)

For evaluating quality, classifying outcomes, or scoring:

```python
import json


def minimax_score(content: str, criteria: str) -> dict:
    """Use MiniMax as a scoring subagent. Returns structured JSON."""
    prompt = (
        f"Score the following content on: {criteria}\n\n"
        f"Content:\n{content[:2000]}\n\n"
        "Return ONLY a JSON object with keys: score (1-10), confidence (0-1), reasoning (string)."
    )
    raw = ask_minimax(prompt, json_mode=True, max_tokens=2000, temperature=0.1)
    return json.loads(raw)


# Example: score a DEPTH answer
result = minimax_score(
    content="Rate limiting should use token bucket with Redis...",
    criteria="actionability, specificity, tradeoff awareness",
)
# {"score": 7, "confidence": 0.85, "reasoning": "Good specificity..."}
```

### Pattern 5: Multi-Turn Conversation

For tasks requiring follow-up reasoning:

```python
def minimax_conversation(messages: list[dict], **kwargs) -> str:
    """Multi-turn MiniMax conversation."""
    payload = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": kwargs.get("max_tokens", 2000),
        "temperature": kwargs.get("temperature", 0.3),
    }

    with httpx.Client(timeout=kwargs.get("timeout", 20.0)) as client:
        resp = client.post(
            f"{BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()

    content = resp.json()["choices"][0]["message"]["content"]
    return THINK_RE.sub("", content).strip()


# Usage:
history = [
    {"role": "user", "content": "What is the CAP theorem?"},
]
reply1 = minimax_conversation(history)
history.append({"role": "assistant", "content": reply1})
history.append({"role": "user", "content": "How does this apply to Redis Cluster?"})
reply2 = minimax_conversation(history)
```

---

## Available Models

| Model | Context | Speed | Use Case |
|-------|---------|-------|----------|
| `MiniMax-M2.5` | 204,800 tokens | Standard | Best quality, deep reasoning |
| `MiniMax-M2.5-highspeed` | 204,800 tokens | Fast | Latency-sensitive calls |
| `MiniMax-M2.1` | — | Standard | Legacy, lower cost |
| `MiniMax-M2.1-highspeed` | — | Fast | Legacy fast variant |
| `MiniMax-M2` | — | Standard | Oldest, cheapest |

**Recommendation:** Use `MiniMax-M2.5` for quality, `MiniMax-M2.5-highspeed` if you need speed.

---

## Supported Features

| Feature | OpenAI Endpoint | Anthropic Endpoint |
|---------|----------------|-------------------|
| Text messages | Yes | Yes |
| System prompt | Yes | Yes |
| Tool/function calling | Yes | Yes |
| Streaming | Yes | Yes |
| Extended thinking | Yes (inline `<think>` tags) | Yes (typed ThinkingBlock) |
| JSON mode | Yes (`response_format`) | No |
| Image input | No | No |
| Document input | No | No |
| `top_p` | Yes | Yes |
| `temperature` | Yes (0, 1] | Yes (0, 1] |

---

## Troubleshooting

### Empty Response

**Symptom:** API returns 200 but response text is empty after stripping `<think>` tags.

**Cause:** `max_tokens` too low. Thinking consumed the entire budget.

**Fix:** Increase `max_tokens` to at least 1500.

### Timeout Errors

**Symptom:** `httpx.ReadTimeout` or `httpx.ConnectTimeout`.

**Cause:** M2.5 thinking takes 3-15 seconds. Default timeouts may be too low.

**Fix:** Set timeout to 15s+ for standard calls, 20s+ for complex prompts.

### 403 Forbidden

**Symptom:** API returns 403 on write operations.

**Cause:** Wrong endpoint or auth method. The Anthropic-compat endpoint uses `ANTHROPIC_AUTH_TOKEN`, not `Bearer`.

**Fix:** Use the OpenAI-compat endpoint (`/v1/chat/completions`) with `Authorization: Bearer {key}`.

### Think Tags in Output

**Symptom:** Response contains `<think>reasoning here</think>` before the actual answer.

**Cause:** Normal M2.5 behavior on the OpenAI-compat endpoint.

**Fix:** Always strip with: `re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL | re.IGNORECASE).strip()`

### Tuneables Override

**Symptom:** MiniMax calls return `None` or are skipped entirely.

**Cause:** `~/.spark/tuneables.json` may have `force_programmatic_synth: true` or `ai_timeout_s` set too low.

**Fix:** Check tuneables:
```bash
python -c "
import json, pathlib
t = pathlib.Path.home() / '.spark' / 'tuneables.json'
data = json.loads(t.read_text()) if t.exists() else {}
print(json.dumps({k: v for k, v in data.items() if 'synth' in k or 'advisory' in k or 'timeout' in str(v)}, indent=2))
"
```

---

## Test Coverage

Existing tests covering MiniMax integration:

| Test File | What It Tests |
|-----------|--------------|
| `tests/test_advisory_synthesizer_env.py` | API key loading from env vs .env file |
| `tests/test_advisory_preferences.py` | Provider selection, model config persistence |
| `tests/test_cli_advisory.py` | CLI `quality-uplift` command with minimax provider |
| `tests/test_opportunity_scanner.py` | LLM provider selection, think block handling, retry logic |
| `tests/test_pulse_startup.py` | Env var loading and propagation |

### Running MiniMax-Specific Tests

```bash
# All MiniMax-related tests (fast, mocked):
python -m pytest tests/test_advisory_synthesizer_env.py tests/test_advisory_preferences.py tests/test_opportunity_scanner.py -v -k minimax

# Live API smoke test:
python -c "
import os, re, httpx
from dotenv import load_dotenv; load_dotenv()
THINK_RE = re.compile(r'<think>.*?</think>', re.DOTALL)
resp = httpx.post(
    'https://api.minimax.io/v1/chat/completions',
    headers={'Authorization': f'Bearer {os.environ[\"MINIMAX_API_KEY\"]}', 'Content-Type': 'application/json'},
    json={'model': 'MiniMax-M2.5', 'messages': [{'role': 'user', 'content': 'Return OK'}], 'max_tokens': 1500},
    timeout=15,
)
clean = THINK_RE.sub('', resp.json()['choices'][0]['message']['content']).strip()
assert clean, 'Empty response - check max_tokens'
print(f'PASS: {clean}')
"
```

---

## Cost Awareness

MiniMax M2.5 is a paid API. Token usage per call:

| Call Type | Typical Tokens | Notes |
|-----------|---------------|-------|
| Simple prompt | 100-300 total | ~100 thinking + response |
| JSON extraction | 300-600 total | ~300 thinking + structured output |
| Complex reasoning | 1000-2000 total | Heavy thinking |
| DEPTH training | 1000-4096 total | Full budget |

**Cost control in Spark:**
- Effect evaluator is opt-in (`use_minimax=False` by default)
- Tracer dashboard checkbox defaults to OFF
- Opportunity scanner has cooldown (`SPARK_OPPORTUNITY_LLM_COOLDOWN_S=900`)
- Advisory synthesizer falls back to free Ollama first

---

## Related Documentation

- `docs/MINIMAX_KIMI_APPLICATION_IDEAS.md` — 48 application ideas for MiniMax + Kimi
- `docs/DEEPSEEK_ISOLATION_RULES.md` — DeepSeek isolation (same pattern applies to MiniMax in DEPTH)
- `docs/ADVISORY_AND_LEARNING_BENCHMARKS.md` — Advisory quality benchmarks
- `docs/RETRIEVAL_IMPROVEMENT_PLAN.md` — Retrieval quality (MiniMax used in scoring)
