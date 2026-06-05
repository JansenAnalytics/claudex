#!/usr/bin/env bash
# Hook: PostToolUse(Skill) — SKILL USAGE LOGGER (Tier 2 item 3A).
#
# On every Skill-tool invocation, append one JSONL line recording which skill was
# loaded and when. This is the data foundation for skill-curator (3B) — nothing else
# currently records which of our 160+ skills actually get used.
#
# Source of truth for the field name: the Skill tool_use carries input.skill (verified
# in transcripts), which the harness surfaces to PostToolUse hooks as .tool_input.skill.
#
# ADVISORY + FAIL-OPEN: pure data collection. Never blocks, never errors out the agent —
# any problem (no jq, no skill name, unwritable path) just exits 0 silently.
#
# Env:
#   SKILL_USAGE_LOG  — override output path (used by tests; default data/skill-usage.jsonl)
#   CLAUDEX_WORKSPACE — workspace root (default ~/.claude-agent)

WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
OUT="${SKILL_USAGE_LOG:-$WORKSPACE/data/skill-usage.jsonl}"

# read hook stdin JSON (fail-open)
input="$(cat 2>/dev/null || true)"
[ -n "$input" ] || exit 0

# extract the skill name; bail quietly if absent or jq missing
skill="$(printf '%s' "$input" | jq -r '.tool_input.skill // empty' 2>/dev/null || true)"
[ -n "$skill" ] || exit 0

# optional context: session id, if the harness provides one
session="$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null || true)"

ts="$(date -Iseconds 2>/dev/null || date)"

mkdir -p "$(dirname "$OUT")" 2>/dev/null || exit 0

# Compose one compact JSON object with jq so the skill name is always valid JSON.
line="$(jq -nc --arg s "$skill" --arg t "$ts" --arg sess "$session" \
    '{skill:$s, ts:$t} + (if $sess=="" then {} else {session:$sess} end)' 2>/dev/null || true)"
[ -n "$line" ] || exit 0

printf '%s\n' "$line" >> "$OUT" 2>/dev/null || exit 0
exit 0
