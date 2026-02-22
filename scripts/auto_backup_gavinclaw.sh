#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE="${1:-$HOME/.openclaw/workspace}"

cd "$REPO_ROOT"

# 1) Sync runtime workspace -> repo snapshot (safe excludes are in script)
bash "$REPO_ROOT/scripts/sync_from_workspace.sh" "$WORKSPACE"

# 2) Commit only if changed
if git diff --quiet && git diff --cached --quiet; then
  echo "NO_CHANGES"
  exit 0
fi

git add -A
if git diff --cached --quiet; then
  echo "NO_CHANGES"
  exit 0
fi

git commit -m "chore: daily gavin snapshot $(date '+%Y-%m-%d %H:%M')"
git push

echo "BACKUP_PUSHED"
