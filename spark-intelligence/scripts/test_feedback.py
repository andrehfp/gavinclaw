#!/usr/bin/env python3
"""Test the feedback loop end-to-end."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.agent_feedback import advisory_acted, learned_something, decision_made, preference

# Report real feedback from today's session
print("=== Writing feedback reports ===")

p = advisory_acted(
    "Disable fastembed in bridge_worker to prevent memory leak",
    "Set SPARK_EMBEDDINGS=0, RAM dropped from 8.6GB to 68MB — 99.2% reduction",
    success=True,
)
print(f"1. Advisory outcome: {p.name}")

p = learned_something(
    "Claude CLI on Windows needs a real console/TTY for OAuth — Python subprocess can't provide one",
    "Spent 30 minutes testing subprocess, cmd, pywinpty before finding PowerShell bridge solution",
    confidence=0.99,
)
print(f"2. Lesson learned: {p.name}")

p = decision_made(
    "Use PowerShell bridge (start /wait /min) for Claude CLI calls",
    "Only approach that provides a real console window from Python on Windows",
    confidence=0.95,
)
print(f"3. Decision made: {p.name}")

p = preference(
    liked="Direct API calls (HTTP) for LLM integration",
    disliked="CLI wrappers requiring console/TTY hacks",
)
print(f"4. Preference: {p.name}")

# Now ingest them
print("\n=== Ingesting reports ===")
from lib.feedback_loop import ingest_reports, get_feedback_stats
stats = ingest_reports()
print(f"Ingested: {stats}")

print("\n=== Feedback stats ===")
fb_stats = get_feedback_stats()
print(f"Stats: {fb_stats}")
