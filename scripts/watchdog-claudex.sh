#!/bin/bash
# Watchdog: check if Claudex is alive AND Telegram delivery is working
# Run via cron every 5 minutes

unset ANTHROPIC_API_KEY
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"

LOG="$HOME/.claude-agent/logs/watchdog.log"
DATA="$HOME/.claude-agent/data"
INBOX="$HOME/.claude/channels/telegram/inbox"
PING_FILE="$DATA/watchdog_ping_pending"
LAST_INBOUND_FILE="$DATA/watchdog_last_inbound_count"
SESSION_START_FILE="$DATA/watchdog_session_start"

mkdir -p "$DATA" "$(dirname "$LOG")"

# ─── Helper: restart Claudex ────────────────────────────────────────────────
do_restart() {
    local reason="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Restarting: $reason" >> "$LOG"

    tmux kill-session -t claudex 2>/dev/null || true
    sleep 3

    cd "$HOME/.claude-agent" && tmux new-session -d -s claudex -c "$HOME/.claude-agent" \
        "$HOME/.local/bin/claude --channels plugin:telegram@claude-plugins-official --model claude-opus-4-7 --dangerously-skip-permissions"

    sleep 8
    PIDS=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Restarted (PID: $PIDS)" >> "$LOG"
        node --experimental-sqlite "$HOME/.claude-agent/scripts/health-check.cjs" --record restart 2>/dev/null || true
        # Record new session start time
        date +%s > "$SESSION_START_FILE"
        # Clear pending ping
        rm -f "$PING_FILE"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Restart FAILED" >> "$LOG"
    fi
}

# ─── Check 1: Is the process alive? ─────────────────────────────────────────
PIDS=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null || true)

if [ -z "$PIDS" ]; then
    do_restart "process dead"
    exit 0
fi

node --experimental-sqlite "$HOME/.claude-agent/scripts/health-check.cjs" --record watchdog_ok 2>/dev/null || true

# ─── Check 2: Session age — restart if > 4 hours (prevents plugin channel rot) ──
SESSION_START=$(cat "$SESSION_START_FILE" 2>/dev/null || echo "0")
NOW=$(date +%s)
SESSION_AGE=$(( NOW - SESSION_START ))
MAX_SESSION_AGE=$(( 24 * 3600 ))  # 24 hours

if [ "$SESSION_AGE" -gt "$MAX_SESSION_AGE" ]; then
    do_restart "session age $(( SESSION_AGE / 3600 ))h exceeds 4h limit — proactive refresh"
    exit 0
fi

# ─── Check 3: Telegram delivery health ──────────────────────────────────────
# Count current inbox files
CURRENT_INBOUND=$(ls "$INBOX/" 2>/dev/null | wc -l | tr -d ' ')
LAST_INBOUND=$(cat "$LAST_INBOUND_FILE" 2>/dev/null || echo "0")

if [ "$CURRENT_INBOUND" -gt "$LAST_INBOUND" ]; then
    # New inbound messages arrived since last check
    if [ -f "$PING_FILE" ]; then
        # We already flagged this — check how long ago
        PING_AGE=$(( NOW - $(cat "$PING_FILE" 2>/dev/null || echo "$NOW") ))
        if [ "$PING_AGE" -gt 600 ]; then
            # 10+ minutes passed — but check if Claudex is actively working first
            PANE=$(tmux capture-pane -t claudex -p 2>/dev/null || true)
            if echo "$PANE" | grep -q "✻\|Thinking\|Running\|Executing\|ms elapsed\|elapsed"; then
                # Claudex is actively processing a task — do NOT restart
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏳ Delivery flag ${PING_AGE}s old but Claudex is actively working — skipping restart" >> "$LOG"
            else
                # Idle at prompt with no response sent — genuinely stuck
                do_restart "Telegram delivery stuck — idle for ${PING_AGE}s with undelivered inbound"
                echo "$CURRENT_INBOUND" > "$LAST_INBOUND_FILE"
                exit 0
            fi
        fi
        # Still within grace period — wait
    else
        # First time we see new inbound — set flag and wait one cycle
        echo "$NOW" > "$PING_FILE"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  New inbound detected (${LAST_INBOUND}→${CURRENT_INBOUND}), monitoring delivery..." >> "$LOG"
    fi
else
    # No new inbound — clear any pending ping flag
    rm -f "$PING_FILE"
fi

# Update inbound count
echo "$CURRENT_INBOUND" > "$LAST_INBOUND_FILE"

# ─── Hourly alive log ────────────────────────────────────────────────────────
MIN=$(date +%M)
if [ "$MIN" = "00" ]; then
    AGE_H=$(( SESSION_AGE / 3600 ))
    AGE_M=$(( (SESSION_AGE % 3600) / 60 ))
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Claudex alive (PID: $PIDS, session age: ${AGE_H}h${AGE_M}m)" >> "$LOG"
fi
