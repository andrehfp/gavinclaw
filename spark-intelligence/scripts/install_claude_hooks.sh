#!/bin/bash
# Install Spark hooks for Claude Code (portable)
# Writes ~/.claude/spark-hooks.json with absolute paths to this repo.
# Does NOT overwrite your existing ~/.claude/settings.json.

set -e

SPARK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLAUDE_DIR="$HOME/.claude"
OUT="$CLAUDE_DIR/spark-hooks.json"

mkdir -p "$CLAUDE_DIR"

cat > "$OUT" <<HOOKS
{
  "hooks": {
    "PreToolUse": [{"matcher":"","hooks":[{"type":"command","command":"python3 $SPARK_DIR/hooks/observe.py"}]}],
    "PostToolUse": [{"matcher":"","hooks":[{"type":"command","command":"python3 $SPARK_DIR/hooks/observe.py"}]}],
    "PostToolUseFailure": [{"matcher":"","hooks":[{"type":"command","command":"python3 $SPARK_DIR/hooks/observe.py"}]}],
    "UserPromptSubmit": [{"matcher":"","hooks":[{"type":"command","command":"python3 $SPARK_DIR/hooks/observe.py"}]}]
  }
}
HOOKS

echo "[spark] wrote: $OUT"
echo "[spark] next: merge hooks into your ~/.claude/settings.json if needed"
