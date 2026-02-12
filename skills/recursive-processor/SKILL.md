---
name: recursive-processor
description: >
  Process arbitrarily long documents or complex tasks using recursive decomposition and sub-agents.
  Use when: input exceeds context limits (>50k tokens), processing large files (PDFs, codebases, logs), hierarchical summarization, or tasks that benefit from divide-and-conquer.
  Don't use when: input fits in context (<50k tokens), simple summarization of short docs, or when the user just wants a quick answer. Don't use for real-time tasks or anything requiring fast responses.
  Outputs: synthesized results from parallel sub-agent processing.
---

# Recursive Processor v2

Based on the Recursive Language Models (RLM) paper (arXiv:2512.24601).

## Core Insight

**Prompts should NOT go directly into context.** Instead:
1. Store input as a **variable in the environment** (file)
2. LLM receives only **metadata** (length, preview, structure)
3. LLM writes **code** to slice, examine, and process
4. Results are built **symbolically** in files
5. Recursion is **programmatic** (loops), not verbalized

## RLM Pattern

```
Input → Store in File → Metadata to LLM → LLM Writes Code → Execute → Recurse → Build Output
```

## When to Use

- Document > 50k tokens (PDFs, books, large codebases)
- Task requires dense access throughout the input
- Traditional summarization loses important details
- Need to do O(n) or O(n²) semantic work on input

## Quick Start

### 1. Store Input as Variable

```bash
# Store the long input in a file (the "REPL variable")
cat large_document.txt > /tmp/rlm_input.txt

# Generate metadata
wc -l /tmp/rlm_input.txt  # lines
wc -c /tmp/rlm_input.txt  # chars
head -50 /tmp/rlm_input.txt > /tmp/rlm_preview.txt
```

### 2. Provide Only Metadata to LLM

Instead of passing content, tell the LLM:
```
INPUT METADATA:
- File: /tmp/rlm_input.txt
- Size: 2.3M chars (~575k tokens)
- Lines: 45,231
- Preview (first 50 lines): [include preview]
- Structure: [detected sections/chapters]

AVAILABLE OPERATIONS:
- Read slice: sed -n 'START,ENDp' /tmp/rlm_input.txt
- Search: grep -n "pattern" /tmp/rlm_input.txt
- Count: grep -c "pattern" /tmp/rlm_input.txt
- Extract section: awk '/START_MARKER/,/END_MARKER/' /tmp/rlm_input.txt

TASK: [user's actual task]

Write code to process this input and build your answer.
Store intermediate results in /tmp/rlm_intermediate_*.txt
Write final answer to /tmp/rlm_output.txt
```

### 3. LLM Writes Processing Code

The LLM generates code like:
```bash
# Example: Find all mentions of "config" and analyze each
grep -n "config" /tmp/rlm_input.txt > /tmp/rlm_matches.txt

# Process each match with context
while read line; do
  linenum=$(echo "$line" | cut -d: -f1)
  start=$((linenum - 5))
  end=$((linenum + 5))
  sed -n "${start},${end}p" /tmp/rlm_input.txt >> /tmp/rlm_contexts.txt
  echo "---" >> /tmp/rlm_contexts.txt
done < /tmp/rlm_matches.txt
```

### 4. Recursive Sub-Calls

For complex tasks, spawn sub-agents that follow the same pattern:
```
sessions_spawn(
  task: "RLM SUB-TASK:
         Input file: /tmp/rlm_chunk_1.txt
         Metadata: {lines: 1000, preview: '...'}
         Task: Extract key findings about authentication
         Output to: /tmp/rlm_result_1.txt",
  label: "rlm-chunk-1"
)
```

### 5. Build Output Symbolically

```bash
# Combine intermediate results
cat /tmp/rlm_result_*.txt > /tmp/rlm_combined.txt

# Final synthesis (this CAN go to LLM context if small enough)
# Or spawn another sub-agent for synthesis
```

## Implementation Patterns

### Pattern A: Programmatic Map-Reduce

```bash
# Split into chunks
split -l 1000 /tmp/rlm_input.txt /tmp/rlm_chunk_

# Process each chunk (can be parallel)
for chunk in /tmp/rlm_chunk_*; do
  sessions_spawn(task="Process $chunk, output to ${chunk}.result")
done

# Reduce
cat /tmp/rlm_chunk_*.result > /tmp/rlm_output.txt
```

### Pattern B: Search-then-Deep-Dive

```bash
# 1. Search for relevant sections
grep -n "important_pattern" /tmp/rlm_input.txt > /tmp/rlm_hits.txt

# 2. Extract context around each hit
# 3. Process only relevant sections
# 4. Much more efficient than processing everything
```

### Pattern C: Hierarchical Tree

```
Level 0: 8 chunks of 50k tokens each
         ↓ (8 sub-agents)
Level 1: 8 summaries of 5k tokens each
         ↓ (combine pairs, 4 sub-agents)  
Level 2: 4 summaries of 3k tokens each
         ↓ (combine pairs, 2 sub-agents)
Level 3: 2 summaries
         ↓ (1 final synthesis)
Output: Final coherent result
```

## Key Differences from v1

| Aspect | v1 (Old) | v2 (RLM-based) |
|--------|----------|----------------|
| Input handling | Pass chunks to sub-agents | Store in file, pass metadata |
| Processing | Natural language instructions | LLM writes code |
| Recursion | Manual orchestration | Programmatic (loops) |
| Output | Aggregate text | Build symbolically in files |
| Efficiency | O(1) calls per chunk | Can do O(n²) if needed |

## What This Enables

1. **Unbounded input**: 10M+ tokens, no problem
2. **Dense access**: Can examine any part, any time
3. **Complex reasoning**: Pairwise comparisons, cross-references
4. **No information loss**: Nothing gets summarized away prematurely
5. **Reproducible**: Code is explicit, can be debugged

## Memory Integration

```bash
# After processing, persist knowledge
cp /tmp/rlm_output.txt memory/documents/$(date +%Y-%m-%d)-analysis.md

# Index for future retrieval
echo "## Summary" >> MEMORY.md
echo "Analyzed [document] on [date], key findings in memory/documents/" >> MEMORY.md
```

## Cost Optimization

- Use grep/awk to filter before sending to LLM
- Process only what's needed (search-first)
- Cache intermediate results
- Use cheaper models for extraction, expensive for synthesis

## Example: Analyze 100-file Codebase

```bash
# 1. Store input
find ./project -name "*.py" -exec cat {} \; > /tmp/rlm_input.txt

# 2. Build index
grep -n "^class\|^def" /tmp/rlm_input.txt > /tmp/rlm_index.txt

# 3. Metadata
wc -l /tmp/rlm_input.txt  # 50,000 lines
head -100 /tmp/rlm_index.txt  # preview structure

# 4. LLM decides what to examine based on task
# 5. Writes code to extract relevant sections
# 6. Spawns sub-agents for deep analysis
# 7. Builds architecture understanding in /tmp/rlm_architecture.md
```

## Limitations

- Requires LLM that can write good bash/python
- More complex to debug than simple prompting
- Overkill for inputs that fit in context
- File I/O adds latency

## References

- Paper: https://arxiv.org/html/2512.24601v2
- Code: https://github.com/alexzhang13/rlm
