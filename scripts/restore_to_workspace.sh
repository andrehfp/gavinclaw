#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$HOME/.openclaw/workspace}"

echo "[restore_to_workspace] source: $REPO_ROOT"
echo "[restore_to_workspace] target: $TARGET"
mkdir -p "$TARGET"

rsync -av \
  --exclude '.git' \
  --exclude 'replication' \
  --exclude 'README.md' \
  --exclude 'CHANGELOG.md' \
  "$REPO_ROOT/" "$TARGET/"

echo "[restore_to_workspace] done"
echo "Next: add secrets + run openclaw cron list + validate channels"
