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

# 3. Rotate logs: gzip .log files older than 7 days, delete .log.gz older than 30 days
find "$LOGS_DIR" -maxdepth 1 -name "*.log" -mtime +7 ! -name "sessions.log" -exec gzip -q {} \; 2>/dev/null
find "$LOGS_DIR" -maxdepth 1 -name "*.log.gz" -mtime +30 -delete 2>/dev/null

# 4. Incremental memory reindex if OPENAI_API_KEY is set and memory-search.cjs exists
MEMORY_SCRIPT="$WORKSPACE/scripts/memory-search.cjs"
if [ -n "$OPENAI_API_KEY" ] && [ -f "$MEMORY_SCRIPT" ]; then
    node --experimental-sqlite "$MEMORY_SCRIPT" --index --incremental 2>/tmp/memory-reindex-err.log || \
        cat /tmp/memory-reindex-err.log
fi

# 5. Status line
echo "✅ Session started | Logs rotated | Memory indexed"
