#!/usr/bin/env python3
"""
Tree of Thoughts (ToT) - Helper utilities

This module provides utilities for the ToT pattern.
The actual orchestration happens via OpenClaw's sessions_spawn,
but this provides perspective generation and result formatting.
"""

import json
import sys
from typing import Optional

# Default perspective sets for common use cases
PERSPECTIVE_SETS = {
    "problem_solving": [
        ("optimist", "Assume the best case. What's the straightforward solution?"),
        ("pessimist", "Find all failure modes. What could go wrong?"),
        ("simplifier", "Strip to essentials. What's the minimal approach?"),
    ],
    "debugging": [
        ("data_flow", "Trace data through the system. Where does it transform?"),
        ("state", "What state could be corrupted or stale?"),
        ("timing", "What race conditions or timing issues exist?"),
        ("external", "What external dependencies could be failing?"),
    ],
    "strategy": [
        ("customer", "Focus purely on user needs and pain points."),
        ("competitor", "What would competitors do? What's the industry standard?"),
        ("contrarian", "What's the opposite of the obvious approach?"),
    ],
    "architecture": [
        ("performance", "Optimize for speed and efficiency."),
        ("maintainability", "Optimize for readability and simplicity."),
        ("flexibility", "Optimize for future changes and extensibility."),
    ],
    "decision": [
        ("pro", "Argue strongly FOR this option."),
        ("con", "Argue strongly AGAINST this option."),
        ("neutral", "Analyze objectively with pros and cons."),
    ],
    "reflection": [
        ("what_worked", "What went well? What should we keep doing?"),
        ("what_failed", "What didn't work? Be brutally honest about failures."),
        ("root_cause", "Why did things fail? Dig deep into root causes, not symptoms."),
        ("lessons", "What lessons should we remember? What would we do differently?"),
        ("next_time", "Concrete changes for next time. Specific, actionable improvements."),
    ],
    "creative": [
        ("wild", "Go crazy. What's the most ambitious, unrealistic idea?"),
        ("practical", "What can we ship in 1 week with current resources?"),
        ("remix", "Combine ideas from other industries. What would Netflix/Apple/Nike do?"),
        ("constraint", "What if we had 10x less budget? Or 10x more?"),
    ],
}


def get_perspectives(
    category: str = "problem_solving",
    count: Optional[int] = None,
    custom: Optional[list] = None
) -> list:
    """Get perspectives for ToT exploration.
    
    Args:
        category: One of problem_solving, debugging, strategy, architecture, decision
        count: Limit number of perspectives (default: all in category)
        custom: Custom list of (name, instruction) tuples
    
    Returns:
        List of (name, instruction) tuples
    """
    if custom:
        return custom
    
    perspectives = PERSPECTIVE_SETS.get(category, PERSPECTIVE_SETS["problem_solving"])
    
    if count:
        perspectives = perspectives[:count]
    
    return perspectives


def format_branch_task(problem: str, perspective_name: str, perspective_instruction: str) -> str:
    """Format a task for a single ToT branch.
    
    Args:
        problem: The problem to solve
        perspective_name: Name of this perspective
        perspective_instruction: Instruction for this angle
    
    Returns:
        Formatted task string for sessions_spawn
    """
    return f"""## Tree of Thoughts Branch: {perspective_name.upper()}

**Your perspective:** {perspective_instruction}

**Problem to analyze:**
{problem}

**Instructions:**
1. Analyze the problem ONLY from your assigned perspective
2. Be specific and actionable
3. Provide concrete findings or recommendations
4. Rate your confidence (low/medium/high)
5. Note any assumptions you made

**Format your response as:**
```
### Perspective: {perspective_name}

**Analysis:**
[Your analysis from this specific angle]

**Key Findings:**
- [Finding 1]
- [Finding 2]

**Recommendation:**
[Specific actionable recommendation]

**Confidence:** [low/medium/high]
**Assumptions:** [Any assumptions made]
```
"""


def format_synthesis_task(problem: str, branch_results: list) -> str:
    """Format a task to synthesize branch results.
    
    Args:
        problem: Original problem
        branch_results: List of results from each branch
    
    Returns:
        Formatted synthesis task
    """
    branches_text = "\n\n---\n\n".join(branch_results)
    
    return f"""## Tree of Thoughts Synthesis

**Original Problem:**
{problem}

**Branch Results:**
{branches_text}

**Your Task:**
1. Review all branch analyses
2. Identify the strongest insights from each
3. Note any contradictions and resolve them
4. Synthesize into a cohesive solution

**Format your response as:**
```
### Synthesized Solution

**Key Insights Combined:**
- From [branch]: [insight]
- From [branch]: [insight]

**Contradictions Resolved:**
[If any branches disagreed, explain resolution]

**Final Recommendation:**
[The synthesized solution combining best elements]

**Action Items:**
1. [Specific step]
2. [Specific step]

**Confidence:** [overall confidence level]
```
"""


def print_spawn_commands(problem: str, category: str = "problem_solving", model: str = "anthropic/claude-3-5-haiku-latest"):
    """Print sessions_spawn commands for each branch.
    
    Useful for manual orchestration or debugging.
    """
    perspectives = get_perspectives(category)
    
    print(f"# Tree of Thoughts: {len(perspectives)} branches")
    print(f"# Category: {category}")
    print(f"# Model: {model}")
    print()
    
    for name, instruction in perspectives:
        task = format_branch_task(problem, name, instruction)
        # Escape for shell
        escaped_task = task.replace("'", "'\"'\"'")
        print(f"# Branch: {name}")
        print(f"sessions_spawn task='{escaped_task}' model='{model}' label='tot-{name}'")
        print()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: tot.py <problem> [category] [model]")
        print()
        print("Categories:", ", ".join(PERSPECTIVE_SETS.keys()))
        print()
        print("Example:")
        print("  tot.py 'Debug why the guide shows wrong time' debugging")
        sys.exit(1)
    
    problem = sys.argv[1]
    category = sys.argv[2] if len(sys.argv) > 2 else "problem_solving"
    model = sys.argv[3] if len(sys.argv) > 3 else "anthropic/claude-3-5-haiku-latest"
    
    print_spawn_commands(problem, category, model)
