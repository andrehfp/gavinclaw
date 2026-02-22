#!/bin/bash
# Run Spark local services (lightweight, compatible)
# Starts: sparkd (8787), bridge_worker, pulse (8765), watchdog

set -e

SPARK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SPARK_DIR"

SPARK_ARGS=()
if [[ "${SPARK_LITE}" == "1" || "${SPARK_LITE}" == "true" || "${SPARK_LITE}" == "yes" ]]; then
  SPARK_ARGS+=("--lite")
fi
if [[ "${SPARK_NO_PULSE}" == "1" ]]; then
  SPARK_ARGS+=("--no-pulse")
fi
if [[ "${SPARK_NO_WATCHDOG}" == "1" ]]; then
  SPARK_ARGS+=("--no-watchdog")
fi

python3 -m spark.cli up "${SPARK_ARGS[@]}"
python3 -m spark.cli services
