---
description: Recap recent activity — what got done, what's in-flight, what's next
allowed-tools: Bash, Read
argument-hint: [today|24h|7d]
---

Build a terse "Done / In-flight / Next" recap of recent Claudex activity. Window from $ARGUMENTS (default `today`; `24h` = last day; `Nd` = last N days). Pull from every source below — each is OPTIONAL, so never abort because one is missing; skip silently and move on.

1. **Daily notes** — `today`/`24h`: read `$HOME/.claude-agent/memory/YYYY-MM-DD.md` for today's date. For `Nd`: glob the last N daily notes. Use `ls -t $HOME/.claude-agent/memory/*.md 2>/dev/null | head -N` then Read each that exists. Extract decisions, completed tasks, problems/solutions.

2. **Event log** — try, in order, robust to absence:
   - `EL="${EVENT_LOG_HOME:-$HOME/projects/event-log}/event-log.cjs"; [ -f "$EL" ] && node "$EL" list --since <window> 2>/dev/null` (fall back to `--limit 30` if `--since` unsupported)
   - else `[ -f ~/.openclaw/events.jsonl ] && tail -n 200 ~/.openclaw/events.jsonl | <filter to window>`
   Summarize event types/highlights; don't dump raw JSON.

3. **Own session activity** — find Claudex's most-recently-touched Claude Code transcript:
   `SLUG=$(echo "$HOME/.claude-agent" | sed 's#[/.]#-#g'); F=$(ls -t "$HOME/.claude/projects/$SLUG"/*.jsonl 2>/dev/null | head -1)` (Claude Code derives the project dir by replacing `/` and `.` with `-`). If it exists, pull assistant-text highlights, e.g.
   `grep '"type":"assistant"' "$F" | tail -40 | jq -r 'try (.message.content[]? | select(.type=="text") | .text) catch empty' 2>/dev/null | grep -v '^$' | tail -15`
   (fall back to plain `grep -o '"text":"[^"]*"'` if jq fails). Distill 3-6 concrete things worked on — not raw lines.

4. **Git activity (optional)** — quick scan of recent commits across projects:
   `for d in ~/projects/*/; do git -C "$d" log --since=<window> --oneline 2>/dev/null | sed "s|^|$(basename "$d"): |"; done | head -20`. Note active repos/branches. Skip dirs that aren't repos.

Output: ONE Telegram-friendly message. Three **bold** headers — **Done**, **In-flight**, **Next** — bullets only, no markdown tables. Lead with a one-line window summary (e.g. `Recap · today · 4 sources`). Max ~22 lines. Infer "Next" from open todos / unfinished threads in the notes. If a source was empty, don't mention it. No padding, no congratulating.
