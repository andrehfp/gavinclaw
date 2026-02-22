#!/usr/bin/env python3
"""Debug PTY spawning for Claude CLI."""
import time, re, sys

print("Importing winpty...")
try:
    from winpty import PtyProcess
    print("OK")
except Exception as e:
    print(f"FAILED: {e}")
    sys.exit(1)

# Test with a simple command first
print("\n=== Test: echo hello ===")
try:
    p = PtyProcess.spawn("cmd /c echo hello")
    out = ""
    t = time.time()
    while p.isalive() and time.time() - t < 5:
        try:
            out += p.read(1024)
        except EOFError:
            break
        time.sleep(0.05)
    print(f"Output: {repr(out[:200])}")
except Exception as e:
    print(f"Error: {e}")

# Test Claude
print("\n=== Test: claude -p ===")
try:
    p = PtyProcess.spawn('claude.cmd -p "say OK"')
    out = ""
    t = time.time()
    while p.isalive() and time.time() - t < 30:
        try:
            out += p.read(4096)
        except EOFError:
            break
        time.sleep(0.05)
    try:
        out += p.read(4096)
    except:
        pass
    clean = re.sub(r'\x1b\[[^m]*m|\x1b\][^\x07]*\x07|\x1b\[\?[0-9;]*[a-zA-Z]', '', out).strip()
    print(f"Raw len: {len(out)}")
    print(f"Clean: [{clean}]")
    print(f"Exit code: {p.exitstatus}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
