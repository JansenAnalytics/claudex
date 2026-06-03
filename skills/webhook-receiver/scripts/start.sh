#!/usr/bin/env bash
# Start the webhook-receiver server in the background
set -euo pipefail

PROJECT_DIR="${WEBHOOK_DIR:-$HOME/projects/webhook-receiver}"
SERVER="${PROJECT_DIR}/server.cjs"
LOG="${PROJECT_DIR}/logs/webhook.log"
PID_FILE="${PROJECT_DIR}/webhook-receiver.pid"
PORT="${WEBHOOK_PORT:-9876}"

if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "[!] webhook-receiver already running (PID $PID)"
    exit 0
  fi
fi

mkdir -p "${PROJECT_DIR}/logs"
echo "[*] Starting webhook-receiver on port $PORT..."
setsid /usr/bin/node "$SERVER" --port "$PORT" > /dev/null 2>&1 &
sleep 1

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[✓] Started (PID $(cat "$PID_FILE"))"
  echo "    Listening on http://127.0.0.1:${PORT}"
  echo "    Log: $LOG"
else
  echo "[✗] Failed to start — check log: $LOG"
  tail -5 "$LOG" 2>/dev/null || true
  exit 1
fi
