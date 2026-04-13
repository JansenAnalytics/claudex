#!/bin/bash
# Called by Stop hook — saves interrupted state
WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
STATE_FILE="$WORKSPACE/data/interrupted-task.json"
mkdir -p "$(dirname "$STATE_FILE")"

# Write interrupted state with timestamp
cat > "$STATE_FILE" << EOF
{
  "interrupted_at": "$(date -Iseconds)",
  "session_log": "$(ls -t "$WORKSPACE/logs/"*.log 2>/dev/null | head -1)",
  "note": "Session was interrupted. Check recent memory files for context."
}
EOF

node --experimental-sqlite "$WORKSPACE/scripts/health-check.cjs" --record session_stop 2>/dev/null || true
echo "[$(date '+%Y-%m-%d %H:%M')] Session stopped — state saved" >> "$WORKSPACE/logs/sessions.log"
