#!/bin/bash
# Watchdog: keep Claudex alive AND verify the channel is actually delivering.
# Run via cron every 5 minutes. Channel-aware (Telegram plugin or Matrix bridge).

unset ANTHROPIC_API_KEY
export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
export CLAUDEX_WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/channel-config.sh" || { echo "❌ Failed to load channel config" >&2; exit 1; }

LOG="$CLAUDEX_WORKSPACE/logs/watchdog.log"
DATA="$CLAUDEX_WORKSPACE/data"
INBOX="$CH_INBOX"
PING_FILE="$DATA/watchdog_ping_pending"
LAST_INBOUND_FILE="$DATA/watchdog_last_inbound_count"
SESSION_START_FILE="$DATA/watchdog_session_start"

mkdir -p "$DATA" "$(dirname "$LOG")"

# ─── Helper: restart Claudex ────────────────────────────────────────────────
do_restart() {
    local reason="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🔄 Restarting ($CH_NAME): $reason" >> "$LOG"

    tmux kill-session -t claudex 2>/dev/null || true
    sleep 3

    cd "$CLAUDEX_WORKSPACE" && tmux new-session -d -s claudex -c "$CLAUDEX_WORKSPACE" "$(channel_launch_cmd)"

    sleep 8
    PIDS=$(pgrep -f "$CH_PROC_MATCH" 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Restarted (PID: $PIDS)" >> "$LOG"
        node --experimental-sqlite "$CLAUDEX_WORKSPACE/scripts/health-check.cjs" --record restart 2>/dev/null || true
        date +%s > "$SESSION_START_FILE"
        rm -f "$PING_FILE"
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Restart FAILED" >> "$LOG"
    fi
}

# ─── Check 1: Is the resident process alive? ────────────────────────────────
PIDS=$(pgrep -f "$CH_PROC_MATCH" 2>/dev/null || true)

if [ -z "$PIDS" ]; then
    do_restart "process dead"
    exit 0
fi

node --experimental-sqlite "$CLAUDEX_WORKSPACE/scripts/health-check.cjs" --record watchdog_ok 2>/dev/null || true

# ─── Check 2: Session age — restart if > 72h (prevents channel rot) ─────────
SESSION_START=$(cat "$SESSION_START_FILE" 2>/dev/null || echo "0")
NOW=$(date +%s)
SESSION_AGE=$(( NOW - SESSION_START ))
MAX_SESSION_AGE=$(( 72 * 3600 ))  # 72 hours

if [ "$SESSION_AGE" -gt "$MAX_SESSION_AGE" ]; then
    do_restart "session age $(( SESSION_AGE / 3600 ))h exceeds 72h limit — proactive refresh"
    exit 0
fi

# ─── Check 3: Transport health ──────────────────────────────────────────────
# The outbound link can die silently even if the resident process is alive.
# (Only checked once a session has been up >1h to avoid startup races.)
if [ "$SESSION_AGE" -gt 3600 ]; then
    if ! channel_transport_healthy; then
        if [ "$CLAUDEX_CHANNEL" = "telegram" ]; then
            do_restart "telegram plugin has no active connections to Telegram API (session age: $(( SESSION_AGE / 3600 ))h)"
            exit 0
        else
            # The Matrix bridge reconnects to the sidecar on its own, and the sidecar
            # is a separately-managed daemon — restarting the bridge would not fix it.
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  matrix-sidecar unreachable — bridge will auto-reconnect; not restarting" >> "$LOG"
        fi
    fi
fi

# ─── Check 4: Delivery health ───────────────────────────────────────────────
# A growing inbox backlog means inbound arrived but no reply was delivered.
CURRENT_INBOUND=$(ls "$INBOX/" 2>/dev/null | wc -l | tr -d ' ')
LAST_INBOUND=$(cat "$LAST_INBOUND_FILE" 2>/dev/null || echo "0")

if [ "$CURRENT_INBOUND" -gt "$LAST_INBOUND" ]; then
    # New inbound (or undelivered backlog) since last check.
    if [ -f "$PING_FILE" ]; then
        PING_AGE=$(( NOW - $(cat "$PING_FILE" 2>/dev/null || echo "$NOW") ))
        if [ "$PING_AGE" -gt 600 ]; then
            # 10+ minutes passed — but don't kill the agent mid-task.
            if channel_active_work; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⏳ Delivery flag ${PING_AGE}s old but Claudex is actively working — skipping restart" >> "$LOG"
            else
                do_restart "$CH_NAME delivery stuck — idle for ${PING_AGE}s with undelivered inbound"
                echo "$CURRENT_INBOUND" > "$LAST_INBOUND_FILE"
                exit 0
            fi
        fi
        # Still within grace period — wait.
    else
        echo "$NOW" > "$PING_FILE"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ⚠️  New inbound detected (${LAST_INBOUND}→${CURRENT_INBOUND}), monitoring delivery..." >> "$LOG"
    fi
else
    # No new inbound (backlog cleared or steady) — clear any pending ping flag.
    rm -f "$PING_FILE"
fi

echo "$CURRENT_INBOUND" > "$LAST_INBOUND_FILE"

# ─── Hourly alive log ────────────────────────────────────────────────────────
MIN=$(date +%M)
if [ "$MIN" = "00" ]; then
    AGE_H=$(( SESSION_AGE / 3600 ))
    AGE_M=$(( (SESSION_AGE % 3600) / 60 ))
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Claudex alive ($CH_NAME, PID: $PIDS, session age: ${AGE_H}h${AGE_M}m)" >> "$LOG"
fi
