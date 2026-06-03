#!/usr/bin/env bash
# Hook: PostToolUse(Write|Edit) — stage all changes after every file write/edit.
# Wire in settings.json:
#   "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [
#     { "type": "command", "command": "bash $HOME/.claude-agent/.claude/hooks/auto-git-add.sh" }
#   ]}]
# Replicates the git-add behavior previously inlined in settings.json. Always exits 0.

# Move to the git toplevel; fall back to "." (cwd) when not inside a repo.
toplevel="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
cd "$toplevel" 2>/dev/null || exit 0

# Stage everything; swallow all errors (e.g. no repo, nothing to add).
git add -A >/dev/null 2>&1 || true

exit 0
