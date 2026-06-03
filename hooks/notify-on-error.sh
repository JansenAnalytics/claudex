#!/usr/bin/env bash
# Hook: PostToolUse — push an ntfy alert when a tool call returns an error.
# Wire in settings.json (matcher "" = all tools):
#   "PostToolUse": [{ "matcher": "", "hooks": [
#     { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/notify-on-error.sh" }
#   ]}]
# No-op unless NTFY_TOPIC is set. Reads the hook JSON from stdin, detects a
# tool error in tool_response, sends one terse line via curl. Always exits 0.

# Nothing configured — bail before doing any work.
[ -n "$NTFY_TOPIC" ] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

payload="$(cat 2>/dev/null)"
[ -n "$payload" ] || exit 0

# Parse error flag + a short summary out of the payload. tool_response may be a
# string or an object; treat error:true, an "error"/"errorText" field, or an
# is_error flag as a failure signal.
summary=""
if command -v python3 >/dev/null 2>&1; then
  summary="$(printf '%s' "$payload" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tool = d.get("tool_name", "tool")
fp = (d.get("tool_input") or {}).get("file_path", "")
r = d.get("tool_response")
err = False
msg = ""
if isinstance(r, dict):
    if r.get("error") or r.get("is_error") or r.get("isError"):
        err = True
    for k in ("errorText", "error", "stderr", "message"):
        v = r.get(k)
        if isinstance(v, str) and v.strip():
            msg = v.strip(); err = err or bool(v.strip()); break
elif isinstance(r, str):
    low = r.lower()
    if "error" in low or "failed" in low or "exception" in low:
        err = True; msg = r.strip()
if not err:
    sys.exit(0)
if not msg:
    msg = "tool error"
msg = " ".join(msg.split())[:160]
loc = f" ({fp})" if fp else ""
print(f"{tool} failed{loc}: {msg}")
' 2>/dev/null)"
elif command -v jq >/dev/null 2>&1; then
  # Coarser jq fallback: flag if tool_response mentions an error.
  if printf '%s' "$payload" | jq -e '
      (.tool_response.error? // .tool_response.is_error? // .tool_response.isError?)
      or ((.tool_response | tostring | ascii_downcase) | test("error|failed|exception"))
    ' >/dev/null 2>&1; then
    tool="$(printf '%s' "$payload" | jq -r '.tool_name // "tool"' 2>/dev/null)"
    summary="$tool failed: tool error"
  fi
fi

# No error detected — quiet exit.
[ -n "$summary" ] || exit 0

curl -fsS \
  -H "Title: Claudex tool error" \
  -H "Priority: high" \
  -H "Tags: warning" \
  -d "$summary" \
  "${NTFY_URL:-https://ntfy.sh}/${NTFY_TOPIC}" >/dev/null 2>&1 || true

exit 0
