#!/usr/bin/env bash
# Hook: Stop — write a tiny resume snapshot when the session ends.
# Wire in settings.json (add as a second hook under the Stop matcher):
#   "Stop": [{ "matcher": "", "hooks": [
#     { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/snapshot-on-stop.sh" }
#   ]}]
# Captures { ts, cwd, git_branch, latest_daily_note } so a fresh session can
# pick up where this one left off. Always exits 0.

OUT="$HOME/.claude-agent/data/last-session-snapshot.json"
MEM_DIR="$HOME/.claude-agent/memory"

# Optional cwd from the stdin payload; fall back to $PWD.
payload="$(cat 2>/dev/null)"
cwd=""
if [ -n "$payload" ] && command -v python3 >/dev/null 2>&1; then
  cwd="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("cwd","") or "")
except Exception:
    print("")' 2>/dev/null)"
fi
[ -n "$cwd" ] || cwd="$PWD"

ts="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"

# Current git branch, if cwd is inside a repo.
branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

# Newest daily note (YYYY-MM-DD.md) by name, then absolute path.
note=""
if [ -d "$MEM_DIR" ]; then
  latest="$(ls -1 "$MEM_DIR"/[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9].md 2>/dev/null | sort | tail -n 1)"
  [ -n "$latest" ] && note="$latest"
fi

mkdir -p "$(dirname "$OUT")" 2>/dev/null || true

# Emit valid JSON; python3 handles escaping, jq is the fallback.
if command -v python3 >/dev/null 2>&1; then
  TS="$ts" CWD="$cwd" BR="$branch" NOTE="$note" python3 -c '
import json, os
print(json.dumps({
    "ts": os.environ.get("TS",""),
    "cwd": os.environ.get("CWD",""),
    "git_branch": os.environ.get("BR","") or None,
    "latest_daily_note": os.environ.get("NOTE","") or None,
}, indent=2))' > "$OUT" 2>/dev/null || true
elif command -v jq >/dev/null 2>&1; then
  jq -n \
    --arg ts "$ts" --arg cwd "$cwd" --arg br "$branch" --arg note "$note" \
    '{ts:$ts, cwd:$cwd, git_branch:($br|select(.!="")), latest_daily_note:($note|select(.!=""))}' \
    > "$OUT" 2>/dev/null || true
fi

exit 0
