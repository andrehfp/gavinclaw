#!/usr/bin/env bash
set -euo pipefail

SRC="${1:-$HOME/.openclaw/workspace}"
DST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[sync_from_workspace] source: $SRC"
echo "[sync_from_workspace] target: $DST"

rsync -av \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '.DS_Store' \
  --exclude '.secrets' \
  --exclude 'credentials' \
  --exclude 'shorts_output' \
  --exclude '*.mp4' \
  --exclude '*.png' \
  --exclude '*.jpg' \
  --exclude '*.jpeg' \
  --exclude '*.webp' \
  --exclude 'spark-intelligence/.venv' \
  --exclude 'spark-intelligence/.spark' \
  "$SRC/" "$DST/"

echo "[sync_from_workspace] done"
