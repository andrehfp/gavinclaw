#!/bin/bash
# Print portable paths/snippets for this Spark repo

set -e
SPARK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "SPARK_DIR=$SPARK_DIR"
echo ""
echo "Claude Code hook command:"
echo "python3 $SPARK_DIR/hooks/observe.py"
echo ""
echo "Run local services:"
echo "cd $SPARK_DIR && ./scripts/run_local.sh"
