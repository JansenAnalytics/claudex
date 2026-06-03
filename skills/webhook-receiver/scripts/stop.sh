#!/usr/bin/env bash
PROJECT_DIR="${WEBHOOK_DIR:-$HOME/projects/webhook-receiver}"
PID_FILE="${PROJECT_DIR}/webhook-receiver.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "[!] No PID file found — is webhook-receiver running?"
  exit 0
fi

PID=$(cat "$PID_FILE")
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID"
    echo "[✓] Killed (SIGKILL) PID $PID"
  else
    echo "[✓] Stopped (PID $PID)"
  fi
  rm -f "$PID_FILE"
else
  echo "[!] Process $PID not running — cleaning up stale PID file"
  rm -f "$PID_FILE"
fi
