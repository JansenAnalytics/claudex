#!/bin/bash
# Incremental reindex for Claudex memory search
# Run via cron every 30 minutes
set -euo pipefail

export HOME="${HOME:-$(getent passwd "$(whoami)" | cut -d: -f6)}"
WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
LOG="$WORKSPACE/logs/memory-reindex.log"
SCRIPT="$WORKSPACE/scripts/memory-search.cjs"
ENV_FILE="$WORKSPACE/.env"

mkdir -p "$(dirname "$LOG")"

# Load API key from workspace .env if not already set
if [ -z "${OPENAI_API_KEY:-}" ] && [ -f "$ENV_FILE" ]; then
    export OPENAI_API_KEY="$(grep OPENAI_API_KEY "$ENV_FILE" | cut -d= -f2-)"
fi

# Only log errors and actual reindex activity (not "0 indexed" runs)
OUTPUT=$(node --experimental-sqlite "$SCRIPT" --index --incremental 2>&1)
INDEXED=$(echo "$OUTPUT" | grep -oP '\d+ indexed' | grep -oP '\d+' || echo "0")

if [ "$INDEXED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Reindexed $INDEXED files" >> "$LOG"
    echo "$OUTPUT" >> "$LOG"
fi
