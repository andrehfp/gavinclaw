#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <job-tag> <command...>" >&2
  exit 2
fi

JOB_TAG="$1"
shift

LOG_ROOT="/home/andreprado/.openclaw/workspace/logs/instacli"
DATE_DIR="$(date +%F)"
mkdir -p "$LOG_ROOT/$DATE_DIR"
LOG_FILE="$LOG_ROOT/$DATE_DIR/${JOB_TAG}.log"

TMP_OUT="$(mktemp)"
TMP_ERR="$(mktemp)"
START_ISO="$(date -Is)"
CMD_STR="$(printf '%q ' "$@")"

set +e
"$@" >"$TMP_OUT" 2>"$TMP_ERR"
STATUS=$?
set -e
END_ISO="$(date -Is)"

{
  echo "[$START_ISO] CMD: $CMD_STR"
  echo "[$END_ISO] EXIT: $STATUS"
  if [ -s "$TMP_OUT" ]; then
    echo "--- STDOUT ---"
    cat "$TMP_OUT"
  fi
  if [ -s "$TMP_ERR" ]; then
    echo "--- STDERR ---"
    cat "$TMP_ERR"
  fi
  echo "---"
} >>"$LOG_FILE"

cat "$TMP_OUT"
cat "$TMP_ERR" >&2

rm -f "$TMP_OUT" "$TMP_ERR"
exit $STATUS
