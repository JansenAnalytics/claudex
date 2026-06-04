#!/bin/bash
# Start Claude Code as the Claudex autonomous agent.
# Called by systemd or manually. Works with either communication channel
# (Telegram plugin or Matrix bridge) — see scripts/channel-config.sh.
# Usage: bash start-claudex.sh [--foreground]

set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="${HOME:-$(getent passwd "$(whoami)" | cut -d: -f6)}"
export LANG="en_US.UTF-8"
export TERM="xterm-256color"

# IMPORTANT: Unset ANTHROPIC_API_KEY so Claude Code uses OAuth (Max subscription)
# If this is set, Claude Code prompts to use it instead of OAuth — breaks auto-restart
unset ANTHROPIC_API_KEY

export CLAUDEX_WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
WORKSPACE="$CLAUDEX_WORKSPACE"
LOG_DIR="$WORKSPACE/logs"
TMUX_SESSION="claudex"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/channel-config.sh" || { echo "❌ Failed to load channel config"; exit 1; }

mkdir -p "$LOG_DIR"
cd "$WORKSPACE"

# If --foreground, run directly (for systemd Type=simple)
if [ "${1:-}" = "--foreground" ]; then
    if [ "$CLAUDEX_CHANNEL" = "matrix" ]; then
        exec python3 "$WORKSPACE/scripts/matrix-bridge.py"
    else
        exec script -qc "$(channel_launch_cmd --continue)" \
            "$LOG_DIR/claudex-$(date +%Y-%m-%d).log"
    fi
fi

# Otherwise, start in tmux (for manual use). "Already running" is treated as
# SUCCESS (exit 0), not an error: the systemd unit is a Type=oneshot trigger and
# the watchdog may already have started the session — failing here would crash-loop
# the unit. Re-running by hand is therefore idempotent.
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "✅ Session '$TMUX_SESSION' already running."
    echo "   Attach: tmux attach -t $TMUX_SESSION"
    echo "   Kill:   tmux kill-session -t $TMUX_SESSION"
    exit 0
fi

# Check if the agent process is already running
if pgrep -f "$CH_PROC_MATCH" > /dev/null 2>&1; then
    echo "✅ Claudex ($CH_NAME) is already running (PID $(pgrep -f "$CH_PROC_MATCH" | tr '\n' ' '))"
    echo "   Kill it first if you want to restart."
    exit 0
fi

# For Matrix, require the account to be configured and warn if the sidecar is down.
if [ "$CLAUDEX_CHANNEL" = "matrix" ]; then
    [ -f "$WORKSPACE/.env" ] && set -a && source "$WORKSPACE/.env" && set +a || true
    if [ -z "${MATRIX_SIDECAR_TOKEN:-}" ] || [ -z "${MATRIX_USER_ID:-}" ]; then
        echo "❌ CLAUDEX_CHANNEL=matrix but MATRIX_SIDECAR_TOKEN / MATRIX_USER_ID are not set in $WORKSPACE/.env."
        echo "   (The access token lives in data/matrix/session.json from 'matrix-sidecar login',"
        echo "    not in .env.) See docs/matrix-setup.md."
        exit 1
    fi
    if ! channel_transport_healthy; then
        echo "⚠️  matrix-sidecar not reachable at ${MATRIX_SIDECAR_URL} — start it first:"
        echo "     systemctl --user start matrix-sidecar"
        echo "   (continuing anyway; the bridge will retry)"
    fi
fi

echo "🚀 Starting Claudex..."
echo "   Workspace: $WORKSPACE"
echo "   Channel:   $CH_NAME"
echo "   Mode:      bypassPermissions"

# For Telegram we continue the previous conversation; the Matrix bridge manages
# per-room sessions itself.
if [ "$CLAUDEX_CHANNEL" = "matrix" ]; then
    LAUNCH="$(channel_launch_cmd)"
else
    LAUNCH="$(channel_launch_cmd --continue)"
fi

tmux new-session -d -s "$TMUX_SESSION" -c "$WORKSPACE" "$LAUNCH"

sleep 3

if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "✅ Claudex started in tmux session '$TMUX_SESSION'"
    echo "   Attach: tmux attach -t $TMUX_SESSION"
    echo "   Logs:   $LOG_DIR/"
else
    echo "❌ Failed to start. Check logs."
    exit 1
fi
