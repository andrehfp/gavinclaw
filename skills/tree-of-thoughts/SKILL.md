---
name: tree-of-thoughts
description: >
  Solve complex problems by exploring multiple reasoning paths in parallel via sub-agents.
  Use when: facing difficult decisions with trade-offs, debugging tricky issues with multiple possible causes, comparing 3+ architectural approaches, or strategic planning where diverse perspectives matter.
  Don't use when: the answer is straightforward, user wants a quick opinion, simple debugging, or tasks where one obvious approach exists. Overkill for routine questions.
  Outputs: synthesized best solution with reasoning from multiple explored paths.
---

# Tree of Thoughts (ToT)

Explore multiple reasoning paths in parallel for complex problems.

## When to Use

- **Difficult decisions** with multiple valid approaches
- **Debugging** when the root cause is unclear
- **Strategy/planning** that benefits from diverse perspectives
- **Creative tasks** needing multiple ideas before selection
- **Code architecture** decisions with tradeoffs

## Quick Start

For simple ToT (3 branches, auto-synthesize):
```
Use Tree of Thoughts to solve: [problem]
```

For customized ToT:
```
Use ToT with 5 branches, perspectives: [list], to solve: [problem]
```

## How It Works

1. **Branch**: Spawn N sub-agents, each with a unique perspective
2. **Explore**: Each agent independently analyzes the problem
3. **Evaluate**: Compare approaches (quality, feasibility, tradeoffs)
4. **Synthesize**: Combine best insights into final solution

## Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| branches | 3 | Number of parallel exploration paths |
| perspectives | auto | Specific angles to explore (or auto-generate) |
| model | haiku | Model for sub-agents (haiku = cheap, sonnet = quality) |
| voting | synthesize | `synthesize` (combine best), `majority` (pick most common), `best` (pick single best) |

## Perspective Templates

### Problem Solving
- **Optimist**: Assume everything works, find the happy path
- **Pessimist**: Find every way this could fail
- **Simplifier**: What's the minimal viable solution?
- **Scalability**: How does this handle 10x/100x growth?

### Debugging
- **Data flow**: Trace the data through the system
- **State**: What state could be corrupted?
- **Race condition**: What timing issues exist?
- **External**: What external dependencies could fail?

### Strategy/Marketing
- **Customer**: What does the user actually want?
- **Competitor**: What would competitors do?
- **Contrarian**: What's the opposite of obvious?
- **Cost/Benefit**: Pure ROI analysis

### Architecture
- **Performance**: Optimize for speed
- **Maintainability**: Optimize for readability
- **Flexibility**: Optimize for future changes
- **Security**: Assume adversarial users

### Reflection (Post-mortem)
- **What worked**: O que deu certo? Manter
- **What failed**: O que falhou? Honestidade brutal
- **Root cause**: Por que falhou? Causa raiz, não sintoma
- **Lessons**: Que lições guardar?
- **Next time**: Mudanças concretas pro futuro

### Creative
- **Wild**: Ideia mais ambiciosa e maluca possível
- **Practical**: O que dá pra entregar em 1 semana?
- **Remix**: Combinar ideias de outras indústrias
- **Constraint**: E se tivesse 10x menos (ou mais) budget?

## Implementation

Use `sessions_spawn` to create parallel sub-agents:

```python
# For each perspective, spawn a sub-agent
for perspective in perspectives:
    sessions_spawn(
        task=f"[{perspective}] Analyze: {problem}",
        model="anthropic/claude-3-5-haiku-latest",
        label=f"tot-{perspective}"
    )

# Wait for all to complete, then synthesize
```

## Example Usage

**Input:**
```
Use ToT to debug: FieldStation42 shows wrong time on the guide
```

**Branches explored:**
1. **Data flow**: Check where time comes from (system → python → tk)
2. **Timezone**: Verify TZ handling at each layer
3. **Rendering**: Check if display logic has offset errors
4. **External**: Check if NTP/system clock is correct

**Synthesis:**
> Investigated 4 angles. Data flow analysis found the issue: 
> `datetime.now()` was called without timezone, defaulting to UTC.
> Fix: Use `datetime.now(tz=ZoneInfo("America/Sao_Paulo"))`

## Tips

- Start with 3 branches; add more only if needed
- Use Haiku for exploration (cheap), Sonnet for synthesis (quality)
- Name perspectives clearly so sub-agents understand their role
- For yes/no decisions, use `voting: majority`
- For creative tasks, use `voting: synthesize`
