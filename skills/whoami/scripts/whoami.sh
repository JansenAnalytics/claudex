#!/usr/bin/env bash
# whoami.sh — render the curated user profile (Tier 2 item 4C). READ-ONLY.
# Prints USER.md, when it was last updated, per-section item counts, a token estimate
# against the ~500-token cap, and a prune nudge for the rolling sections.
#
# Env: CLAUDEX_WORKSPACE (default ~/.claude-agent)

set -uo pipefail
WORKSPACE="${CLAUDEX_WORKSPACE:-$HOME/.claude-agent}"
USER_MD="$WORKSPACE/memory/USER.md"
CAP_TOK=500

if [ ! -s "$USER_MD" ]; then
    echo "No user profile yet ($USER_MD is missing/empty)."
    echo "It is auto-created by the memory-curate cron job as facts accumulate."
    exit 0
fi

echo "👤 User Profile  —  $USER_MD"
# Last modified (portable-ish: GNU stat)
mod="$(stat -c '%y' "$USER_MD" 2>/dev/null | cut -d'.' -f1 || true)"
[ -n "$mod" ] && echo "   last updated: $mod"

bytes="$(wc -c < "$USER_MD" | tr -d ' ')"
toks=$(( (bytes + 3) / 4 ))
echo "   size: ${bytes}B  ·  ~${toks} tokens / ${CAP_TOK} cap"
if [ "$toks" -gt "$CAP_TOK" ]; then
    echo "   ⚠️  OVER the ${CAP_TOK}-token cap — prune stable_facts/preferences below."
fi
echo "──────────────────────────────────────────────────────────────"
cat "$USER_MD"
echo "──────────────────────────────────────────────────────────────"

# Per-section item counts.
echo "Section counts:"
awk '
    /^##[[:space:]]+/ { sec=$2; counts[sec]=counts[sec]+0; order[++n]=sec; next }
    /^[[:space:]]*-[[:space:]]+/ { if (sec!="") counts[sec]++ }
    END { for (i=1;i<=n;i++) printf "   %-20s %d\n", order[i], counts[order[i]] }
' "$USER_MD"

# Prune nudge for the rolling sections.
corr=$(awk '/^##[[:space:]]+recent_corrections/{f=1;next} /^##[[:space:]]/{f=0} f&&/^[[:space:]]*-/{c++} END{print c+0}' "$USER_MD")
open=$(awk '/^##[[:space:]]+open_threads/{f=1;next} /^##[[:space:]]/{f=0} f&&/^[[:space:]]*-/{c++} END{print c+0}' "$USER_MD")
echo "Maintenance:"
echo "   recent_corrections: $corr (rolling, kept newest 8) · open_threads: $open (rolling, kept newest 6)"
echo "   → Resolve stale open_threads and fold settled recent_corrections into preferences/stable_facts."
echo "   (This skill is read-only — edit memory/USER.md by hand to prune.)"
