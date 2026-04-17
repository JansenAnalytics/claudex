#!/bin/bash
# Start Claude Code as Kite-CC / Claudex autonomous agent
# Called by systemd or manually
# Usage: bash start-claudex.sh [--foreground]

set -euo pipefail

export PATH="$HOME/.bun/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="/home/ajans"
export LANG="en_US.UTF-8"
export TERM="xterm-256color"

# IMPORTANT: Unset ANTHROPIC_API_KEY so Claude Code uses OAuth (Max subscription)
# If this is set, Claude Code prompts to use it instead of OAuth — breaks auto-restart
unset ANTHROPIC_API_KEY

WORKSPACE="$HOME/.claude-agent"
LOG_DIR="$WORKSPACE/logs"
TMUX_SESSION="claudex"

mkdir -p "$LOG_DIR"
cd "$WORKSPACE"

# If --foreground, run directly (for systemd)
if [ "${1:-}" = "--foreground" ]; then
    exec script -qc "$HOME/.local/bin/claude \
        --channels plugin:telegram@claude-plugins-official \
        --model claude-opus-4-7 \
        --dangerously-skip-permissions \
        --continue" \
        "$LOG_DIR/claudex-$(date +%Y-%m-%d).log"
fi

# Otherwise, start in tmux (for manual use)
if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "⚠️  Session '$TMUX_SESSION' already running."
    echo "   Attach: tmux attach -t $TMUX_SESSION"
    echo "   Kill:   tmux kill-session -t $TMUX_SESSION"
    exit 1
fi

# Check if claude process is already running
if pgrep -f "claude.*channels.*telegram" > /dev/null 2>&1; then
    echo "⚠️  Claude Code with Telegram is already running (PID $(pgrep -f 'claude.*channels.*telegram'))"
    echo "   Kill it first if you want to restart: kill $(pgrep -f 'claude.*channels.*telegram')"
    exit 1
fi

echo "🚀 Starting Claudex..."
echo "   Workspace: $WORKSPACE"
echo "   Telegram: @Claudex"
echo "   Mode: bypassPermissions"

tmux new-session -d -s "$TMUX_SESSION" -c "$WORKSPACE" \
    "$HOME/.local/bin/claude --channels plugin:telegram@claude-plugins-official --model claude-opus-4-7 --dangerously-skip-permissions --continue"

sleep 3

if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    echo "✅ Claudex started in tmux session '$TMUX_SESSION'"
    echo "   Attach: tmux attach -t $TMUX_SESSION"
    echo "   Logs:   $LOG_DIR/"
else
    echo "❌ Failed to start. Check logs."
    exit 1
fi
