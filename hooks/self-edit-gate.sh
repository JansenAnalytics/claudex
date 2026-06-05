#!/usr/bin/env bash
# Hook: PostToolUse(Write|Edit) — SELF-EDIT SAFETY GATE.
#
# When the agent edits one of its OWN skill files (.claude/skills/<name>/SKILL.md),
# validate it and, on failure, surface a one-line warning to the model via exit 2
# (advisory — the tool already ran; this does NOT block and does NOT auto-revert).
# Checks: (1) frontmatter/schema via the existing scripts/skill-audit.sh,
#         (2) hard size limit 15 KB, (3) secret/token-shaped values.
# Does NOT flag $HOME or personal names — those are normal in the LIVE workspace;
# the public-sync scrub (sync-to-repo.sh) handles those separately.
#
# FAIL-OPEN: any internal error or out-of-scope path exits 0 so a bug can never wedge
# the running agent. Set SELF_EDIT_GATE_DRYRUN=1 to print instead of warning.
#
# Wire in settings.json under the existing PostToolUse "Write|Edit" matcher.

WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
DRYRUN="${SELF_EDIT_GATE_DRYRUN:-0}"

# --- read hook stdin JSON (fail-open) ---
input="$(cat 2>/dev/null || true)"
[ -n "$input" ] || exit 0
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"

# --- scope: only our own SKILL.md files; everything else is a no-op ---
case "$file" in
  */.claude/skills/*/SKILL.md) : ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

skill="$(basename "$(dirname "$file")")"
problems=""

# (1) frontmatter / schema — only exit code 1 means real errors (2 = not-found etc -> skip)
audit_out="$(bash "$WORKSPACE/scripts/skill-audit.sh" --skill "$skill" --quiet 2>&1)"
audit_rc=$?
if [ "$audit_rc" -eq 1 ]; then
  detail="$(printf '%s\n' "$audit_out" | grep -iE 'error|✗|not in|missing|invalid|required' | head -2 | tr '\n' ' ' | sed 's/  */ /g')"
  problems="${problems}audit failed (${detail:-see skill-audit}); "
fi

# (2) hard size gate (15 KB)
bytes="$(wc -c < "$file" 2>/dev/null || echo 0)"
if [ "${bytes:-0}" -gt 15360 ] 2>/dev/null; then
  problems="${problems}SKILL.md ${bytes}B exceeds 15360B (15KB) limit; "
fi

# (3) secret/token-shaped VALUES (not bare words like the literal 'ANTHROPIC_API_KEY')
SECRET_RE='sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}'
if grep -Eq "$SECRET_RE" "$file" 2>/dev/null; then
  problems="${problems}possible secret/token value in file; "
fi

# --- verdict ---
if [ -n "$problems" ]; then
  msg="⚠️ self-edit-gate: skill '$skill' — ${problems%; } — fix or undo this edit (the gate is advisory, the edit was kept)."
  if [ "$DRYRUN" = "1" ]; then
    echo "[dry-run] WOULD WARN: $msg"
    exit 0
  fi
  echo "$msg" >&2
  exit 2
fi
exit 0
