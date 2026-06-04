#!/bin/bash
# tests/channel-config.test.sh — assertions for scripts/channel-config.sh
# Run: bash tests/channel-config.test.sh

CFG="$(cd "$(dirname "$0")/.." && pwd)/scripts/channel-config.sh"
PASS=0; FAIL=0
ok() { echo "ok   - $1"; PASS=$((PASS + 1)); }
no() { echo "FAIL - $1"; FAIL=$((FAIL + 1)); }
assert_eq()    { if [ "$1" = "$2" ]; then ok "$3"; else no "$3 (expected '$2', got '$1')"; fi; }
assert_match() { if echo "$1" | grep -q "$2"; then ok "$3"; else no "$3 (pattern '$2' not in '$1')"; fi; }
assert_func()  { if [ "$(type -t "$1")" = "function" ]; then ok "$2"; else no "$2 ($1 not a function)"; fi; }

# Load channel-config with a controlled workspace + channel; CH_* become global.
load() {
    unset CH_NAME CH_INBOX CH_ACCESS CH_PROC_MATCH CH_TRANSPORT_MATCH CLAUDEX_CHANNEL
    export CLAUDEX_WORKSPACE="$1"
    if [ -n "$2" ]; then export CLAUDEX_CHANNEL="$2"; else unset CLAUDEX_CHANNEL; fi
    # shellcheck source=/dev/null
    source "$CFG"
}

TMPWS="$(mktemp -d)"; mkdir -p "$TMPWS/data"
trap 'rm -rf "$TMPWS"' EXIT

# ── Default channel is telegram (behavior preserved) ──────────────────────────
load "$TMPWS" ""
assert_eq "$CLAUDEX_CHANNEL" "telegram" "defaults to telegram when unset"
assert_eq "$CH_NAME" "Telegram" "default CH_NAME"

# ── Explicit telegram ─────────────────────────────────────────────────────────
load "$TMPWS" "telegram"
assert_eq "$CH_NAME" "Telegram" "telegram CH_NAME"
assert_match "$CH_INBOX" "channels/telegram/inbox" "telegram inbox path"
assert_match "$CH_PROC_MATCH" "channels.*telegram" "telegram proc match"
assert_eq "$CH_TRANSPORT_MATCH" "bun.*telegram" "telegram transport match"
assert_match "$(channel_launch_cmd --continue)" "channels plugin:telegram@claude-plugins-official" "telegram launch cmd"
assert_match "$(channel_launch_cmd --continue)" "\-\-continue" "telegram launch honors extra flag"

# ── Explicit matrix ───────────────────────────────────────────────────────────
load "$TMPWS" "matrix"
assert_eq "$CH_NAME" "Matrix" "matrix CH_NAME"
assert_match "$CH_INBOX" "channels/matrix/inbox" "matrix inbox path"
assert_match "$CH_ACCESS" "channels/matrix/access.json" "matrix access path"
assert_eq "$CH_PROC_MATCH" "matrix-bridge\\.py" "matrix proc match"
assert_eq "$CH_TRANSPORT_MATCH" "matrix-sidecar" "matrix transport match"
assert_match "$(channel_launch_cmd)" "matrix-bridge.py" "matrix launch cmd"
assert_match "$(channel_launch_cmd)" "^python3 " "matrix launch uses python3"

# ── Functions are defined for both channels ───────────────────────────────────
assert_func channel_transport_healthy "channel_transport_healthy defined"
assert_func channel_active_work "channel_active_work defined"

# ── Workspace channel file is honored when env is unset ───────────────────────
echo "matrix" > "$TMPWS/data/channel"
load "$TMPWS" ""
assert_eq "$CLAUDEX_CHANNEL" "matrix" "reads channel from workspace file"
rm -f "$TMPWS/data/channel"

# ── env overrides the workspace file ──────────────────────────────────────────
echo "matrix" > "$TMPWS/data/channel"
load "$TMPWS" "telegram"
assert_eq "$CLAUDEX_CHANNEL" "telegram" "env overrides workspace file"
rm -f "$TMPWS/data/channel"

# ── Unknown channel fails ─────────────────────────────────────────────────────
load "$TMPWS" "bogus"; rc=$?
if [ "$rc" -ne 0 ]; then ok "unknown channel returns non-zero"; else no "unknown channel should fail (rc=$rc)"; fi

echo "----"
echo "channel-config: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
