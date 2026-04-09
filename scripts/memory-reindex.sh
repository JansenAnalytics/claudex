#!/bin/bash
# Incremental reindex for Claudex memory search
# Run via cron every 30 minutes
set -euo pipefail

export OPENAI_API_KEY="$(grep OPENAI_API_KEY /home/ajans/.openclaw/env | cut -d= -f2-)"
export HOME="/home/ajans"

LOG="/home/ajans/.claude-agent/logs/memory-reindex.log"
mkdir -p "$(dirname "$LOG")"

# Only log errors and actual reindex activity (not "0 indexed" runs)
OUTPUT=$(node --experimental-sqlite /home/ajans/.claude-agent/scripts/memory-search.cjs --index --incremental 2>&1)
INDEXED=$(echo "$OUTPUT" | grep -oP '\d+ indexed' | grep -oP '\d+' || echo "0")

if [ "$INDEXED" -gt 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Reindexed $INDEXED files" >> "$LOG"
    echo "$OUTPUT" >> "$LOG"
fi
