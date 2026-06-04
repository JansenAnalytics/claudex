#!/bin/bash
# channel-config.sh — single source of truth for channel-specific settings.
#
# Source this from the lifecycle scripts (start/stop/status/restart/watchdog).
# It resolves which communication channel Claudex is using and exports the
# channel-specific paths, process-match patterns, and helper functions so the
# rest of the tooling stays channel-agnostic.
#
# Channel selection precedence:
#   1. $CLAUDEX_CHANNEL environment variable
#   2. the workspace channel file  ($CLAUDEX_WORKSPACE/data/channel)
#   3. default: telegram   (preserves historical behavior)
#
# Exported variables:
#   CLAUDEX_CHANNEL      telegram | matrix
#   CH_NAME              human label ("Telegram" / "Matrix")
#   CH_INBOX             inbound delivery-health dir
#   CH_ACCESS            access-policy JSON path
#   CH_PROC_MATCH        pgrep -f pattern for the resident agent process
#   CH_TRANSPORT_MATCH   pgrep -f pattern for the transport (plugin / sidecar)
#
# Exported functions:
#   channel_launch_cmd [extra-flags]   prints the command to start the resident process
#   channel_transport_healthy          returns 0 if the transport link is healthy
#   channel_active_work                returns 0 if the agent is actively processing

: "${CLAUDEX_WORKSPACE:=$HOME/.claude-agent}"
: "${CLAUDEX_MODEL:=claude-opus-4-8}"
CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"

# Resolve channel: env → workspace file → default.
if [ -z "${CLAUDEX_CHANNEL:-}" ] && [ -f "$CLAUDEX_WORKSPACE/data/channel" ]; then
    CLAUDEX_CHANNEL="$(tr -d '[:space:]' < "$CLAUDEX_WORKSPACE/data/channel" 2>/dev/null)"
fi
CLAUDEX_CHANNEL="${CLAUDEX_CHANNEL:-telegram}"

# Matrix sidecar endpoint (also read by matrix-bridge.py / the sidecar itself).
: "${MATRIX_SIDECAR_PORT:=8765}"
MATRIX_SIDECAR_URL="${MATRIX_SIDECAR_URL:-http://127.0.0.1:${MATRIX_SIDECAR_PORT}}"

case "$CLAUDEX_CHANNEL" in
    telegram)
        CH_NAME="Telegram"
        CH_INBOX="$HOME/.claude/channels/telegram/inbox"
        CH_ACCESS="$HOME/.claude/channels/telegram/access.json"
        CH_PROC_MATCH="claude.*channels.*telegram"
        CH_TRANSPORT_MATCH="bun.*telegram"
        ;;
    matrix)
        CH_NAME="Matrix"
        CH_INBOX="${MATRIX_INBOX_DIR:-$HOME/.claude/channels/matrix/inbox}"
        CH_ACCESS="${MATRIX_ACCESS_FILE:-$HOME/.claude/channels/matrix/access.json}"
        # The resident process is the Python bridge; the transport is the Rust sidecar.
        CH_PROC_MATCH="matrix-bridge\.py"
        CH_TRANSPORT_MATCH="matrix-sidecar"
        ;;
    *)
        echo "❌ Unknown CLAUDEX_CHANNEL: '$CLAUDEX_CHANNEL' (expected: telegram|matrix)" >&2
        return 1 2>/dev/null || exit 1
        ;;
esac

# Make resolved settings available to the sourcing script and any child processes.
export CLAUDEX_CHANNEL CH_NAME CH_INBOX CH_ACCESS CH_PROC_MATCH CH_TRANSPORT_MATCH
export MATRIX_SIDECAR_PORT MATRIX_SIDECAR_URL

# Command to start the resident channel process (run inside tmux / systemd).
# For telegram an optional extra flag (e.g. --continue) can be appended.
channel_launch_cmd() {
    case "$CLAUDEX_CHANNEL" in
        telegram)
            printf '%s --channels plugin:telegram@claude-plugins-official --model %s --dangerously-skip-permissions %s' \
                "$CLAUDE_BIN" "$CLAUDEX_MODEL" "${1:-}"
            ;;
        matrix)
            # The bridge reads MATRIX_* / CLAUDEX_* from the environment / workspace .env.
            # It manages per-room Claude sessions itself, so no --continue is used.
            printf 'python3 %s/scripts/matrix-bridge.py' "$CLAUDEX_WORKSPACE"
            ;;
    esac
}

# Is the channel transport link healthy? (used by the watchdog)
channel_transport_healthy() {
    case "$CLAUDEX_CHANNEL" in
        telegram)
            # The bun plugin must hold at least one connection to Telegram's API ranges.
            local conns
            conns=$(ss -tp 2>/dev/null | grep "bun" | grep -cE "149\.154\.|91\.108\." || true)
            [ "${conns:-0}" -gt 0 ]
            ;;
        matrix)
            # The matrix-sidecar daemon must answer its (unauthenticated) health endpoint.
            curl -fsS --max-time 8 "${MATRIX_SIDECAR_URL}/health" >/dev/null 2>&1
            ;;
    esac
}

# Is the agent actively processing a task right now? (avoid killing mid-task)
channel_active_work() {
    case "$CLAUDEX_CHANNEL" in
        telegram)
            local pane
            pane=$(tmux capture-pane -t claudex -p 2>/dev/null || true)
            echo "$pane" | grep -q "✻\|Thinking\|Running\|Executing\|ms elapsed\|elapsed"
            ;;
        matrix)
            # The bridge spawns `claude -p ...` per message; its presence means work in flight.
            pgrep -f "claude -p" >/dev/null 2>&1
            ;;
    esac
}
