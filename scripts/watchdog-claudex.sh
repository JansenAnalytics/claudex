#!/bin/bash
# Watchdog: check if Claudex is alive, restart if not
# Run via cron every 5 minutes

# Ensure Claude Code uses OAuth, not API key
unset ANTHROPIC_API_KEY

LOG="$HOME/.claude-agent/logs/watchdog.log"
mkdir -p "$(dirname "$LOG")"

PIDS=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null || true)

if [ -z "$PIDS" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Claudex down — restarting..." >> "$LOG"
    bash "$HOME/.claude-agent/scripts/start-claudex.sh" >> "$LOG" 2>&1
    
    # Verify it started
    sleep 10
    PIDS=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Claudex restarted (PID: $PIDS)" >> "$LOG"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Restart FAILED" >> "$LOG"
    fi
else
    # Only log every hour to avoid spam (check minute = 00)
    MIN=$(date +%M)
    if [ "$MIN" = "00" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Claudex alive (PID: $PIDS)" >> "$LOG"
    fi
fi
