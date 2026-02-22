#!/bin/bash
# Tail logs for a Spark service

set -e
LOG_DIR="$HOME/.spark/logs"
name="$1"
if [ -z "$name" ]; then
  echo "usage: ./scripts/logs.sh <sparkd|bridge_worker|dashboard>"
  exit 1
fi
log="$LOG_DIR/${name}.log"
if [ ! -f "$log" ]; then
  echo "no log at $log"
  exit 1
fi

tail -n 200 -f "$log"
