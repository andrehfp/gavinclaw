# DeepSeek API Isolation Rules for DEPTH v3 Training Pipeline

## Purpose

DeepSeek V3.2 is used exclusively as an answer generation model in the DEPTH training loop. These rules ensure that no proprietary information, user data, business logic, or project-specific context leaks to DeepSeek's servers. DeepSeek sees generic domain questions and returns generic domain answers. Nothing else.


## Rule 1: Strict Role Isolation

DeepSeek is ONLY permitted to perform one function: generating answers to DEPTH evaluation questions.

```
ALLOWED:
  - Receive a DEPTH question (from domain YAML)
  - Receive a topic string (e.g., "visual hierarchy", "responsive breakpoints")
  - Receive the current depth level and mode
  - Return a text answer

FORBIDDEN:
  - Scoring answers (Opus 4.6 only)
  - Generating follow-up questions (Sonnet 4.5 only)
  - Knowledge extraction or gap analysis (Sonnet 4.5 only)
  - Any Spark advisory, cognitive, or memory operations
  - Any direct interaction with users
```


## Rule 2: Input Sanitization -- What DeepSeek Can See

Every prompt sent to DeepSeek must be constructed from ONLY these components:

```python
ALLOWED_PROMPT_COMPONENTS = {
    "question":      str,   # From domain YAML template, topic-substituted
    "topic":         str,   # Generic topic string (e.g., "dark mode", "accessibility")
    "depth":         int,   # Current depth level (1-15)
    "mode":          str,   # "vibe" or "classic"
    "level_name":    str,   # Level label (e.g., "GROUND", "SYNTHESIZE")
    "level_lens":    str,   # Level description from engine
    "domain_id":     str,   # Domain identifier (e.g., "ui_ux", "security")
}
```

Everything else is BLOCKED from the prompt:

```python
BLOCKED_FROM_DEEPSEEK = [
    # Spark internals
    "cognitive_insights",
    "advisory_packets",
    "eidos_state",
    "meta_ralph_scores",
    "chip_insights",
    "spark_context",
    "memory_banks",
    "prediction_logs",
    "outcome_data",

    # Business context
    "vibeship_*",
    "seedify_*",
    "scanner_*",
    "spawner_*",
    "moltbook_*",

    # User/agent identity
    "agent_name",
    "user_id",
    "session_history",
    "api_keys",
    "credentials",

    # Project-specific code
    "source_code",
    "repository_paths",
    "file_contents",
    "git_history",

    # Training metadata that reveals strategy
    "previous_scores",
    "score_history",
    "learning_targets",
    "weak_areas",
    "training_strategy",
]
```


## Rule 3: Prompt Template (Exact Format)

DeepSeek receives ONLY this prompt structure:

```python
DEEPSEEK_ANSWER_PROMPT = """
You are answering a technical evaluation question.

Domain: {domain_id}
Topic: {topic}
Depth Level: {depth} / {max_depth} ({level_name})
Perspective: {level_lens}

Question:
{question}

Provide a thorough, specific, and actionable answer.
Reference concrete examples, specific values, and real-world tradeoffs.
"""
```

No system prompt reveals what Spark is, what Vibeship is, what the training loop does, or why this question is being asked. DeepSeek sees a generic evaluation question and answers it. That's all.


## Rule 4: Response Handling -- What Comes Back

DeepSeek's response is treated as UNTRUSTED TEXT:

```python
def handle_deepseek_response(raw_response: str) -> str:
    """
    Process DeepSeek answer before it enters the Spark pipeline.
    """
    # 1. Strip to plain text (no tool calls, no structured output)
    answer = extract_text_content(raw_response)

    # 2. Truncate to reasonable length
    answer = answer[:MAX_ANSWER_LENGTH]  # e.g., 4000 chars

    # 3. Basic coherence check (reject gibberish)
    if not is_coherent_text(answer):
        return None  # Fall back to local model

    # 4. DO NOT parse for instructions or follow embedded commands
    # Treat as opaque text that gets passed to Opus for scoring

    return answer
```

DeepSeek's answers are NEVER:
- Executed as code
- Parsed as JSON commands
- Used to modify Spark configuration
- Fed back into DeepSeek as context for future calls
- Stored with any metadata linking them to Spark internals


## Rule 5: Network Isolation

```yaml
# Environment configuration
DEPTH_ANSWER_MODEL: "deepseek-chat"
DEPTH_ANSWER_ENDPOINT: "https://api.deepseek.com/v1/chat/completions"
DEPTH_ANSWER_API_KEY: "${DEEPSEEK_API_KEY}"

# Separate API key with minimal permissions
# Do NOT reuse keys used for other services

# Request headers -- no identifying information
DEPTH_ANSWER_HEADERS:
  Content-Type: "application/json"
  Authorization: "Bearer ${DEEPSEEK_API_KEY}"
  # No custom headers that reveal project identity
  # No User-Agent strings mentioning Spark/Vibeship

# Timeout and retry
DEPTH_ANSWER_TIMEOUT_S: 30
DEPTH_ANSWER_MAX_RETRIES: 2
```


## Rule 6: No Conversation History

Every DeepSeek call is STATELESS. No multi-turn context.

```python
# CORRECT: Single-turn, isolated call
messages = [
    {"role": "user", "content": formatted_prompt}
]

# WRONG: Multi-turn with previous answers
messages = [
    {"role": "user", "content": previous_question},
    {"role": "assistant", "content": previous_answer},  # NEVER DO THIS
    {"role": "user", "content": next_question},
]
```

Each DEPTH question is an independent API call. DeepSeek never sees:
- Previous answers from the same session
- Score feedback from Opus
- Follow-up context from Sonnet
- Accumulated session trajectory


## Rule 7: Logging Isolation

```python
# DeepSeek interactions are logged SEPARATELY
DEEPSEEK_LOG_PATH = "~/.spark/logs/deepseek_calls.jsonl"

# Each log entry contains ONLY:
{
    "timestamp": "ISO-8601",
    "domain": "ui_ux",
    "topic": "dark mode",
    "depth": 7,
    "question_hash": "sha256_of_question",  # Not the full question
    "answer_length": 1847,
    "latency_ms": 2340,
    "model": "deepseek-chat",
    "status": "success|failure|timeout|incoherent"
}

# Log does NOT contain:
# - Full question text (reconstructable from domain YAML + topic)
# - Full answer text (stored separately in DEPTH session DB)
# - Any Spark context or scores
# - Session IDs that link to Spark internals
```


## Rule 8: Model Swappability

DeepSeek is behind an abstraction layer. Swappable with zero code changes:

```python
class DepthAnswerGenerator:
    """
    Abstract answer generation. Model is configurable.
    All models receive the same sanitized prompt.
    """

    PROVIDERS = {
        "deepseek":  {"endpoint": "https://api.deepseek.com/v1/chat/completions",
                      "model": "deepseek-chat",
                      "key_env": "DEEPSEEK_API_KEY"},
        "kimi":      {"endpoint": "https://api.moonshot.cn/v1/chat/completions",
                      "model": "moonshot-v1-128k",
                      "key_env": "KIMI_API_KEY"},
        "qwen":      {"endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                      "model": "qwen3-235b-a22b",
                      "key_env": "QWEN_API_KEY"},
        "ollama":    {"endpoint": "http://localhost:11434/api/generate",
                      "model": "phi4-mini:latest",
                      "key_env": None},
    }

    def __init__(self, provider: str = None):
        self.provider = provider or os.getenv("DEPTH_ANSWER_PROVIDER", "deepseek")
        self.config = self.PROVIDERS[self.provider]

    def generate(self, question: str, topic: str, depth: int,
                 domain_id: str, mode: str, level_name: str,
                 level_lens: str) -> Optional[str]:
        """
        Generate answer using configured provider.
        Prompt is sanitized identically regardless of provider.
        """
        prompt = self._build_sanitized_prompt(
            question=question, topic=topic, depth=depth,
            domain_id=domain_id, mode=mode,
            level_name=level_name, level_lens=level_lens
        )

        raw = self._call_api(prompt)
        return self._sanitize_response(raw)

    def _build_sanitized_prompt(self, **kwargs) -> str:
        """Build prompt from ALLOWED components only."""
        # Validates that no blocked content is present
        for key in kwargs:
            assert key in ALLOWED_PROMPT_COMPONENTS, \
                f"Blocked field in prompt: {key}"
        return DEEPSEEK_ANSWER_PROMPT.format(**kwargs)
```


## Rule 9: What Each Model Sees (Summary)

```
DeepSeek V3.2 (answer generation):
  Sees:    Generic domain question + topic + depth level
  Returns: Text answer
  Knows:   Nothing about Spark, Vibeship, Seedify, or training loop

Opus 4.6 (scoring):
  Sees:    Question + answer + scoring dimensions + domain emphasis
  Returns: Per-dimension scores + gap analysis + pushback
  Knows:   This is an evaluation context (no business specifics needed)

Sonnet 4.5 (follow-ups + knowledge extraction):
  Sees:    Question + answer + score + depth context
  Returns: Targeted follow-up question / learning artifacts
  Knows:   Training context for generating useful follow-ups

Local model (fallback only):
  Sees:    Same sanitized prompt as DeepSeek
  Returns: Text answer (lower quality)
  Knows:   Nothing (runs locally, no network)
```


## Rule 10: Audit Checklist

Before any DEPTH training run, verify:

- [ ] DeepSeek prompt contains NO Spark/Vibeship references
- [ ] DeepSeek prompt contains NO previous scores or training metadata
- [ ] DeepSeek prompt contains NO source code or file paths
- [ ] DeepSeek prompt contains NO user/agent identity information
- [ ] DeepSeek calls are single-turn (no conversation history)
- [ ] DeepSeek API key is separate from other service keys
- [ ] DeepSeek responses are treated as untrusted text
- [ ] Logs do not contain full prompts/responses in DeepSeek-specific logs
- [ ] DEPTH_ANSWER_PROVIDER env var can swap models without code changes
- [ ] Fallback to local model works when DeepSeek is unreachable


## Implementation Priority

1. **Implement `DepthAnswerGenerator` class** with provider abstraction
2. **Add input sanitization** that validates prompts against ALLOWED_PROMPT_COMPONENTS
3. **Add response handling** with coherence check and truncation
4. **Configure separate API key** for DeepSeek (don't reuse)
5. **Set up isolated logging** for DeepSeek calls
6. **Add audit check** that runs before each training cycle
7. **Test swappability** by running same session with DeepSeek and Kimi, comparing Opus scores
