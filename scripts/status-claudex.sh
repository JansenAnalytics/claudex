#!/bin/bash
# Check Claudex status
echo "=== Claudex Status ==="

# Check process
PIDS=$(pgrep -f "claude.*channels.*telegram" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "✅ Claude Code running (PID: $PIDS)"
    ps -p $PIDS -o pid,etime,rss,%mem --no-headers 2>/dev/null | while read pid time rss mem; do
        echo "   Uptime: $time | Memory: ${rss}KB ($mem%)"
    done
else
    echo "❌ Claude Code NOT running"
fi

# Check telegram plugin
BUN_PIDS=$(pgrep -f "bun.*telegram" 2>/dev/null || true)
if [ -n "$BUN_PIDS" ]; then
    echo "✅ Telegram plugin running (PID: $BUN_PIDS)"
else
    echo "❌ Telegram plugin NOT running"
fi

# Check tmux
if tmux has-session -t claudex 2>/dev/null; then
    echo "✅ tmux session 'claudex' exists"
else
    echo "⚠️  No tmux session (running via exec or systemd)"
fi

# Check systemd
STATUS=$(systemctl --user is-active claudex.service 2>/dev/null || echo "inactive")
ENABLED=$(systemctl --user is-enabled claudex.service 2>/dev/null || echo "disabled")
echo "📋 Systemd: $STATUS (enabled: $ENABLED)"

# Check Telegram auth
if [ -f ~/.claude/channels/telegram/access.json ]; then
    ALLOWED=$(cat ~/.claude/channels/telegram/access.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('allowFrom',[])))" 2>/dev/null || echo "?")
    echo "✅ Telegram paired ($ALLOWED allowed user(s))"
else
    echo "❌ Telegram NOT configured"
fi

# Recent log activity
LOG=$(ls -t ~/.claude-agent/logs/claudex-*.log 2>/dev/null | head -1)
if [ -n "$LOG" ]; then
    MOD=$(stat -c %Y "$LOG" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$(( (NOW - MOD) / 60 ))
    echo "📝 Latest log: $(basename $LOG) (${AGE}m ago)"
fi
