#!/bin/bash
# Stop Claudex gracefully (channel-aware).
export CLAUDEX_WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/channel-config.sh" || { echo "❌ Failed to load channel config"; exit 1; }

echo "🛑 Stopping Claudex ($CH_NAME)..."

# Kill tmux session if exists
if tmux has-session -t claudex 2>/dev/null; then
    tmux kill-session -t claudex
    echo "   Killed tmux session"
fi

# Kill the resident agent process(es)
PIDS=$(pgrep -f "$CH_PROC_MATCH" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    sleep 2
    kill -9 $PIDS 2>/dev/null || true
    echo "   Killed agent process(es): $PIDS"
fi

# For Telegram, the bun plugin runs as a child of the session — stop it too.
# For Matrix, the matrix-sidecar is a separate, independently-managed daemon — leave it running.
if [ "$CLAUDEX_CHANNEL" = "telegram" ]; then
    BUN_PIDS=$(pgrep -f "$CH_TRANSPORT_MATCH" 2>/dev/null || true)
    if [ -n "$BUN_PIDS" ]; then
        kill $BUN_PIDS 2>/dev/null || true
        echo "   Killed Telegram plugin: $BUN_PIDS"
    fi
else
    echo "   (matrix-sidecar daemon left running — manage it via its own service)"
fi

echo "✅ Claudex stopped"
