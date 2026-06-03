---
description: Composite health audit — skills, services, watchdog, memory index, recent restarts
allowed-tools: Bash, Read
---

Produce a single composite audit report of Claudex's own state. Three sections, no fluff.

1. **System health** — run `bash ~/.claude-agent/scripts/status-claudex.sh --full` (or equivalent) for tmux/systemd/process state, plus disk/memory/uptime. Read recent `~/.claude-agent/logs/watchdog.log` entries.
2. **Memory & RAG** — `node --experimental-sqlite ~/.claude-agent/scripts/memory-search.cjs --stats` for chunk counts, provider, last reindex time. Note any embedding-provider mismatch warnings.
3. **Skill catalog** — if `~/.claude-agent/scripts/skill-audit.sh` exists, run it. Otherwise grep `~/.claude-agent/.claude/skills/*/SKILL.md` for: count by category, count with external_deps, count by maturity, and any skill missing required frontmatter.

Output format: one Telegram-friendly message, bullets only, max 25 lines. Lead each section with a one-line verdict (✅/⚠️/❌). End with a "Action items" section listing concrete things to fix — empty list if all clean.

Don't pad. Don't congratulate. If everything's fine, the report should be short.
