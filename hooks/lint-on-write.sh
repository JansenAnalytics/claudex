#!/usr/bin/env bash
# Hook: PostToolUse(Write|Edit) — fast syntax check on the file just written.
# Wire in settings.json (add as a second hook under the Write|Edit matcher):
#   "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [
#     { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/lint-on-write.sh" }
#   ]}]
# Reads the hook JSON from stdin, picks a linter by extension, prints a WARNING
# to stderr on failure. Skips silently for unknown types / missing linters.
# Never blocks. Always exits 0.

# Pull tool_input.file_path from the stdin payload (jq, then python3 fallback).
payload="$(cat 2>/dev/null)"
file=""
if command -v jq >/dev/null 2>&1; then
  file="$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
fi
if [ -z "$file" ] && command -v python3 >/dev/null 2>&1; then
  file="$(printf '%s' "$payload" | python3 -c 'import sys,json
try:
    print(json.load(sys.stdin).get("tool_input",{}).get("file_path","") or "")
except Exception:
    print("")' 2>/dev/null)"
fi

# Nothing to check, or the file no longer exists.
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

warn() { printf 'WARNING: lint failed for %s\n%s\n' "$file" "$1" >&2; }

case "$file" in
  *.sh)
    if command -v shellcheck >/dev/null 2>&1; then
      out="$(shellcheck -S warning "$file" 2>&1)" || warn "$out"
    fi
    ;;
  *.js|*.cjs|*.mjs)
    if command -v node >/dev/null 2>&1; then
      out="$(node --check "$file" 2>&1)" || warn "$out"
    fi
    ;;
  *.py)
    if command -v python3 >/dev/null 2>&1; then
      out="$(python3 -m py_compile "$file" 2>&1)" || warn "$out"
    fi
    ;;
  *.json)
    if command -v jq >/dev/null 2>&1; then
      out="$(jq . "$file" >/dev/null 2>&1)" || warn "invalid JSON"
    fi
    ;;
  *)
    : # unknown extension — skip silently
    ;;
esac

exit 0
