---
description: Dump current context — recent memory, active tasks, in-flight projects — for handoff or review
allowed-tools: Bash, Read
---

Produce a structured context dump so the user (or another session) can pick up where this one left off.

Pull from these sources, in this order:

1. **Today's daily memory** — `~/.claude-agent/memory/YYYY-MM-DD.md` if it exists. Summarize, don't paste.
2. **Yesterday's daily memory** — same, for continuity.
3. **Active tasks** — `TaskList` output, grouped by status. Highlight in-progress tasks.
4. **Inbox** — `node ~/.claude-agent/scripts/inbox.cjs --list` if there are pending entries.
5. **Recent plans** — list any files in `~/.claude-agent/memory/plans/` modified in the last 7 days with their titles.
6. **Recent decisions/learnings** — `node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --search "decision OR learned OR figured out" --limit 5 --source memory --quiet` if the index is built.
7. **Cross-agent flags** — anything from Kite/Poe/Argus daily files in the last 24h that mentions Claudex.

Output format: Telegram-friendly message. Use bold headers per section, bullets within. Skip empty sections silently. Cap at ~30 lines — the goal is a usable handoff, not an exhaustive transcript.

End with a "**Resume point:**" line — one sentence saying what the next session should do first.
