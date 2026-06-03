#!/bin/bash
# Opportunity Scanner cron wrapper
# Refreshes data, runs scan, delivers via OpenClaw agent to Telegram
#
# Usage: cron-scan.sh [--refresh] [--min-score N]
#
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS="$SKILL_DIR/scripts"
LOG_DIR="$SKILL_DIR/logs"
mkdir -p "$LOG_DIR"

LOGFILE="$LOG_DIR/scan-$(date +%Y-%m-%d_%H%M).log"
MIN_SCORE="${2:-3}"
REFRESH=""

for arg in "$@"; do
    case "$arg" in
        --refresh) REFRESH="--refresh" ;;
        --min-score=*) MIN_SCORE="${arg#*=}" ;;
    esac
done

echo "$(date -Iseconds) Starting opportunity scan (min_score=$MIN_SCORE, refresh=$REFRESH)" >> "$LOGFILE"

# Run scan and capture Telegram output
OUTPUT=$(cd "$SCRIPTS" && python3 scan.py $REFRESH --min-score "$MIN_SCORE" --telegram 2>>"$LOGFILE")

if [ -z "$OUTPUT" ]; then
    echo "$(date -Iseconds) No opportunities above threshold" >> "$LOGFILE"
    exit 0
fi

echo "$(date -Iseconds) Scan complete, delivering to Telegram" >> "$LOGFILE"

# Deliver via openclaw cron agent message
# The openclaw cron system will pick this up and send it
echo "$OUTPUT" > "$LOG_DIR/latest-scan.txt"

# Use openclaw CLI to send
export PATH="$HOME/.local/bin:$HOME/openclaw/node_modules/.bin:$PATH"
openclaw cron run \
    --profile argus \
    --to <your-telegram-user-id> \
    --no-deliver \
    --message "Read the scan results below and send them to Telegram chat ID <your-telegram-user-id> using the message tool. Use parse_mode html. Here are the results:

$OUTPUT" \
    2>>"$LOGFILE" || {
    # Fallback: just log it
    echo "$(date -Iseconds) openclaw delivery failed, results saved to latest-scan.txt" >> "$LOGFILE"
}

echo "$(date -Iseconds) Done" >> "$LOGFILE"
