#!/bin/bash
# Called by SessionStart hook — initializes session, resumes interrupted tasks
WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
LOGS_DIR="$WORKSPACE/logs"
DATA_DIR="$WORKSPACE/data"
INTERRUPTED_FILE="$DATA_DIR/interrupted-task.json"

mkdir -p "$LOGS_DIR" "$DATA_DIR"

# 1. Log session start + record watchdog session timestamp
echo "[$(date '+%Y-%m-%d %H:%M')] Session started" >> "$LOGS_DIR/sessions.log"
date +%s > "$DATA_DIR/watchdog_session_start"
ls "$HOME/.claude/channels/telegram/inbox/" 2>/dev/null | wc -l | tr -d ' ' > "$DATA_DIR/watchdog_last_inbound_count"
# Record health event
node --experimental-sqlite "$WORKSPACE/scripts/health-check.cjs" --record session_start 2>/dev/null || true

# 2. Check for interrupted task state
if [ -f "$INTERRUPTED_FILE" ]; then
    echo "⚠️  INTERRUPTED TASK DETECTED:"
    cat "$INTERRUPTED_FILE"
    echo ""
    mv "$INTERRUPTED_FILE" "$INTERRUPTED_FILE.handled"
fi

# Check inbox for pending tasks
if [ -f "$DATA_DIR/inbox.json" ]; then
    PENDING=$(node "$WORKSPACE/scripts/inbox.cjs" --list 2>/dev/null || true)
    if [ -n "$PENDING" ] && ! echo "$PENDING" | grep -q "Inbox (0 pending)"; then
        echo ""
        echo "$PENDING"
        echo ""
    fi
fi

# 2.5. Load the auto-curated user profile into context (Tier 2 item 4C).
# USER.md is maintained by the cron distiller (scripts/memory-curate.cjs --scan, 2-hourly). Injecting it here
# is what makes that curation actually reach the model — without this cat the profile
# is written every session but never read. Guarded: only emit if present and non-empty.
# Canonical path = the file memory-curate.cjs writes ($WORKSPACE/memory/USER.md).
USER_PROFILE="$WORKSPACE/memory/USER.md"
if [ -s "$USER_PROFILE" ]; then
    echo ""
    echo "===== USER PROFILE (auto-curated — memory/USER.md) ====="
    cat "$USER_PROFILE"
    echo "===== END USER PROFILE ====="
    echo ""
fi

# 3. Rotate logs: gzip .log files older than 7 days, delete .log.gz older than 30 days
find "$LOGS_DIR" -maxdepth 1 -name "*.log" -mtime +7 ! -name "sessions.log" -exec gzip -q {} \; 2>/dev/null
find "$LOGS_DIR" -maxdepth 1 -name "*.log.gz" -mtime +30 -delete 2>/dev/null

# 4. Incremental memory reindex if OPENAI_API_KEY is set and memory-search.cjs exists
MEMORY_SCRIPT="$WORKSPACE/scripts/memory-search.cjs"
if [ -n "$OPENAI_API_KEY" ] && [ -f "$MEMORY_SCRIPT" ]; then
    node --experimental-sqlite "$MEMORY_SCRIPT" --index --incremental 2>/tmp/memory-reindex-err.log || \
        cat /tmp/memory-reindex-err.log
fi

# 5. Verify v2 skill conventions are active
# CLAUDE_SKILLS_DIR is set via settings.json env block; if missing, skills fall back to a default.
# This is informational only — not a failure mode.
if [ -z "${CLAUDE_SKILLS_DIR:-}" ]; then
    CLAUDE_SKILLS_DIR_STATUS="(fallback)"
else
    CLAUDE_SKILLS_DIR_STATUS="set"
fi

# 6. Status line
echo "✅ Session started | Logs rotated | Memory indexed | CLAUDE_SKILLS_DIR $CLAUDE_SKILLS_DIR_STATUS"
