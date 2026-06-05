#!/usr/bin/env bash
# skill-usage-backfill.sh — seed data/skill-usage.jsonl from historical transcripts
# (Tier 2 item 3A, one-time backfill) so day-1 curator stats aren't empty.
#
# Scans Claude Code session transcripts for past Skill-tool invocations and emits one
# JSONL line per load: {"skill","ts","session","src":"backfill"}. The realtime hook
# (skill-usage-log.sh) writes live lines WITHOUT src=="backfill", so this script is
# idempotent: it strips any prior backfill lines first, then re-appends, never touching
# live lines.
#
# Usage:
#   bash scripts/skill-usage-backfill.sh            # backfill into data/skill-usage.jsonl
#   bash scripts/skill-usage-backfill.sh --dry-run  # print what it would add, write nothing
#   bash scripts/skill-usage-backfill.sh --out FILE # alternate output (tests)
#
# Env: CLAUDEX_WORKSPACE (default ~/.claude-agent)

set -uo pipefail

WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
OUT="$WORKSPACE/data/skill-usage.jsonl"
DRYRUN=0
# Transcript roots: all Claude Code project dirs for this user.
PROJECTS_DIR="${CLAUDE_PROJECTS_DIR:-$HOME/.claude/projects}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRYRUN=1; shift ;;
        --out)     OUT="$2"; shift 2 ;;
        --projects-dir) PROJECTS_DIR="$2"; shift 2 ;;
        -h|--help) sed -n '2,/^set -/p' "$0" | sed 's/^# \?//'; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

command -v jq >/dev/null 2>&1 || { echo "jq required" >&2; exit 2; }
[[ -d "$PROJECTS_DIR" ]] || { echo "no transcripts dir: $PROJECTS_DIR" >&2; exit 0; }

# Gather all transcript files.
mapfile -t FILES < <(find "$PROJECTS_DIR" -type f -name '*.jsonl' 2>/dev/null)
if [[ ${#FILES[@]} -eq 0 ]]; then
    echo "no transcript files found under $PROJECTS_DIR" >&2
    exit 0
fi

# Extract every Skill load. Each transcript line is one JSON event; parent .timestamp
# and .sessionId apply to the tool_use blocks inside .message.content[].
extracted="$(
    cat "${FILES[@]}" 2>/dev/null | jq -rc '
        select(.message.content? | type == "array")
        | {ts: .timestamp, session: .sessionId} as $p
        | .message.content[]
        | select(.type == "tool_use" and .name == "Skill")
        | {skill: (.input.skill // empty), ts: ($p.ts // ""), session: ($p.session // ""), src: "backfill"}
        | select(.skill != "")
    ' 2>/dev/null
)"

count="$(printf '%s' "$extracted" | grep -c . || true)"

if [[ "$DRYRUN" -eq 1 ]]; then
    echo "[dry-run] would backfill $count skill-load record(s) into $OUT"
    printf '%s\n' "$extracted" | head -20
    [[ "$count" -gt 20 ]] && echo "... ($((count - 20)) more)"
    exit 0
fi

mkdir -p "$(dirname "$OUT")"

# Idempotent merge: keep existing LIVE lines (no src=="backfill"), drop old backfill
# lines, then append the freshly extracted backfill set.
tmp="$(mktemp)"
if [[ -f "$OUT" ]]; then
    jq -c 'select((.src // "") != "backfill")' "$OUT" 2>/dev/null > "$tmp" || true
fi
printf '%s\n' "$extracted" | grep . >> "$tmp" || true
mv "$tmp" "$OUT"

live="$(jq -rc 'select((.src // "") != "backfill")' "$OUT" 2>/dev/null | grep -c . || true)"
echo "✅ backfill complete: $count backfilled + $live live = $(grep -c . "$OUT") total lines in $OUT"

# Quick top-skills summary so the run is immediately informative.
echo "Top skills by historical use:"
jq -r '.skill' "$OUT" 2>/dev/null | sort | uniq -c | sort -rn | head -10 | sed 's/^/   /'
