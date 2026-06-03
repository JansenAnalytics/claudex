#!/usr/bin/env bash
PROJECT_DIR="${WEBHOOK_DIR:-$HOME/projects/webhook-receiver}"
PID_FILE="${PROJECT_DIR}/webhook-receiver.pid"
LOG="${PROJECT_DIR}/logs/webhook.log"
PORT="${WEBHOOK_PORT:-9876}"

echo "=== webhook-receiver status ==="
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Status:  ✅ RUNNING (PID $(cat "$PID_FILE"))"
  echo "Port:    $PORT"
  # Quick HTTP check
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -d '{"test":true}' "http://127.0.0.1:${PORT}/ping" 2>/dev/null || echo "000")
  echo "Ping:    HTTP $CODE (POST /ping)"
else
  echo "Status:  ❌ NOT RUNNING"
fi

echo ""
echo "=== Recent log ==="
tail -20 "$LOG" 2>/dev/null || echo "(no log yet)"
