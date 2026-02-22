#!/usr/bin/env python3
"""Test Claude CLI via PTY on Windows."""
import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Test 1: Direct PTY call
print("=== Test 1: pywinpty ===")
try:
    from winpty import PtyProcess
    proc = PtyProcess.spawn(r'claude -p "say just the word OK"')
    output = ""
    start = time.time()
    while proc.isalive() and (time.time() - start) < 30:
        try:
            output += proc.read(1024)
        except EOFError:
            break
        time.sleep(0.1)
    # Clean ANSI escape codes
    import re
    clean = re.sub(r'\x1b\[[^m]*m|\x1b\][^\x07]*\x07|\x1b\[\?[0-9;]*[a-zA-Z]', '', output).strip()
    print(f"Raw length: {len(output)}, Clean: [{clean}]")
except Exception as e:
    print(f"PTY failed: {e}")

# Test 2: lib.llm module
print("\n=== Test 2: lib.llm.ask_claude ===")
from lib.llm import ask_claude
result = ask_claude("What is 2+2? Reply with just the number.")
print(f"Result: [{result}]")
