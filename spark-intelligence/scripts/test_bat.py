#!/usr/bin/env python3
"""Test Claude via batch wrapper."""
import subprocess, os

bat = os.path.join(os.path.dirname(os.path.abspath(__file__)), "claude_ask.bat")

print("Testing batch wrapper...")
try:
    result = subprocess.run(
        [bat, "say just OK"],
        capture_output=True,
        text=True,
        timeout=30,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )
    print(f"Return code: {result.returncode}")
    print(f"Stdout: [{result.stdout.strip()}]")
    print(f"Stderr: [{result.stderr.strip()[:200]}]")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")

# Also try without CREATE_NEW_CONSOLE but with shell=True
print("\nTesting with shell=True...")
try:
    result = subprocess.run(
        f'claude -p "say just OK"',
        capture_output=True,
        text=True,
        timeout=30,
        shell=True,
        encoding="utf-8",
        errors="replace",
    )
    print(f"Return code: {result.returncode}")
    print(f"Stdout: [{result.stdout.strip()}]")
    print(f"Stderr: [{result.stderr.strip()[:200]}]")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")

# Try with start /wait
print("\nTesting with start /wait...")
try:
    result = subprocess.run(
        ['cmd', '/c', 'claude', '-p', 'say just OK'],
        capture_output=True,
        text=True,
        timeout=30,
        encoding="utf-8",
        errors="replace",
    )
    print(f"Return code: {result.returncode}")
    print(f"Stdout: [{result.stdout.strip()}]")
    print(f"Stderr: [{result.stderr.strip()[:200]}]")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
