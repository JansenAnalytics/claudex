#!/bin/bash
# Check Claudex status (channel-aware).
FULL=false
for arg in "$@"; do
    [ "$arg" = "--full" ] && FULL=true
done

export CLAUDEX_WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/channel-config.sh" || { echo "❌ Failed to load channel config"; exit 1; }

echo "=== Claudex Status ($CH_NAME) ==="

# Check resident agent process
PIDS=$(pgrep -f "$CH_PROC_MATCH" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "✅ Agent running (PID: $PIDS)"
    ps -p $PIDS -o pid,etime,rss,%mem --no-headers 2>/dev/null | while read -r _pid etime rss mem; do
        echo "   Uptime: $etime | Memory: ${rss}KB ($mem%)"
    done
else
    echo "❌ Agent NOT running"
fi

# Check channel transport
if [ "$CLAUDEX_CHANNEL" = "telegram" ]; then
    BUN_PIDS=$(pgrep -f "$CH_TRANSPORT_MATCH" 2>/dev/null || true)
    if [ -n "$BUN_PIDS" ]; then
        echo "✅ Telegram plugin running (PID: $BUN_PIDS)"
    else
        echo "❌ Telegram plugin NOT running"
    fi
else
    if channel_transport_healthy; then
        echo "✅ matrix-sidecar reachable (${MATRIX_SIDECAR_URL})"
    else
        echo "❌ matrix-sidecar NOT reachable (${MATRIX_SIDECAR_URL})"
    fi
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

# Check access control
if [ -f "$CH_ACCESS" ]; then
    ALLOWED=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print(len(d.get('allowFrom',[])))" "$CH_ACCESS" 2>/dev/null || echo "?")
    echo "✅ $CH_NAME access configured ($ALLOWED allowed sender(s))"
else
    echo "❌ $CH_NAME access NOT configured ($CH_ACCESS)"
fi

# Recent log activity
LOG=$(ls -t "$CLAUDEX_WORKSPACE"/logs/claudex-*.log 2>/dev/null | head -1)
if [ -n "$LOG" ]; then
    MOD=$(stat -c %Y "$LOG" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE=$(( (NOW - MOD) / 60 ))
    echo "📝 Latest log: $(basename "$LOG") (${AGE}m ago)"
fi

# --full: show health report
if [ "$FULL" = true ]; then
    echo ""
    node --experimental-sqlite "$CLAUDEX_WORKSPACE/scripts/health-check.cjs" --report 2>/dev/null || echo "⚠️  Health report unavailable"
fi
