#!/bin/bash
# Called by Stop hook — saves interrupted state. Skipped for headless per-message
# turns (e.g. the Matrix bridge's `claude -p`) via CLAUDEX_SKIP_LIFECYCLE_HOOKS=1.
[ -n "${CLAUDEX_SKIP_LIFECYCLE_HOOKS:-}" ] && exit 0
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
