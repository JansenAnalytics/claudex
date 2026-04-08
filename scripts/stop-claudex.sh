#!/bin/bash
# Stop Claudex gracefully
echo "🛑 Stopping Claudex..."

# Kill tmux session if exists
if tmux has-session -t claudex 2>/dev/null; then
    tmux kill-session -t claudex
    echo "   Killed tmux session"
fi

# Kill any remaining claude processes with telegram channel
PIDS=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    kill $PIDS 2>/dev/null || true
    sleep 2
    # Force kill if still alive
    kill -9 $PIDS 2>/dev/null || true
    echo "   Killed claude process(es): $PIDS"
fi

# Kill the bun telegram plugin
BUN_PIDS=$(pgrep -f "bun.*telegram" 2>/dev/null || true)
if [ -n "$BUN_PIDS" ]; then
    kill $BUN_PIDS 2>/dev/null || true
    echo "   Killed telegram plugin: $BUN_PIDS"
fi

echo "✅ Claudex stopped"
