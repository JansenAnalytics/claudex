#!/usr/bin/env bash
# Hook: Stop — MEMORY-CURATION NUDGE.
# At session end, on non-trivial sessions, reflect over the transcript and persist ONLY
# durable facts (append-only, deduped) to the daily note + USER.md. Wired ASYNC so it
# never delays session exit. ALWAYS exits 0 (fail-open). Never blocks the stop.
#
# Wire in settings.json under "Stop" (a third command, after session-shutdown + snapshot),
# with "async": true and a timeout.

WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
LOG="$WORKSPACE/logs/memory-curate.log"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

input="$(cat 2>/dev/null || true)"
[ -n "$input" ] || exit 0

active="$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
[ "$active" = "true" ] && exit 0   # re-entrancy guard

turns="$(printf '%s' "$input" | jq -r '.turn_count // 0' 2>/dev/null || echo 0)"
tp="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
case "$turns" in ''|*[!0-9]*) turns=0 ;; esac

[ -n "$tp" ] && [ -f "$tp" ] || { echo "[$(date '+%F %T')] skip: no transcript" >> "$LOG" 2>/dev/null; exit 0; }

# Non-trivial gate: prefer turn_count; fall back to transcript line count if absent/small.
n="$turns"
if [ "$n" -lt 6 ]; then n="$(wc -l < "$tp" 2>/dev/null || echo 0)"; fi
case "$n" in ''|*[!0-9]*) n=0 ;; esac
if [ "$n" -lt 6 ]; then echo "[$(date '+%F %T')] skip: trivial session (n=$n)" >> "$LOG" 2>/dev/null; exit 0; fi

# Throttle: Stop fires EVERY turn on a persistent agent, so run the (paid) curation at
# most once per INTERVAL minutes. Stamp BEFORE running so concurrent fires are throttled.
# Set MEMORY_CURATE_INTERVAL_MIN=0 to disable (used by tests). Silent when throttled.
STAMP="$WORKSPACE/data/.memory-curate-last"
INTERVAL_MIN="${MEMORY_CURATE_INTERVAL_MIN:-30}"
mkdir -p "$(dirname "$STAMP")" 2>/dev/null || true
now="$(date +%s)"
if [ -f "$STAMP" ]; then
  last="$(cat "$STAMP" 2>/dev/null || echo 0)"; case "$last" in ''|*[!0-9]*) last=0 ;; esac
  if [ $(( (now - last) / 60 )) -lt "$INTERVAL_MIN" ]; then exit 0; fi
fi
echo "$now" > "$STAMP" 2>/dev/null || true

echo "[$(date '+%F %T')] curate start (turns=$turns, n=$n)" >> "$LOG" 2>/dev/null
# Run detached so the Stop hook returns immediately and never delays session exit
# (the .cjs has its own 90s internal timeout; the watchdog keeps the box alive).
nohup node "$WORKSPACE/.claude/hooks/memory-curate.cjs" "$tp" >> "$LOG" 2>&1 &
exit 0
