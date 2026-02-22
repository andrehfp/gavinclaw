#!/usr/bin/env sh
set -e

CMD="${SPARK_CODEX_CMD:-${CODEX_CMD:-codex}}"
if [ -z "${SPARK_SYNC_TARGETS:-}" ]; then
  export SPARK_SYNC_TARGETS="codex"
fi
python -m spark.cli sync-context
exec "$CMD" "$@"
