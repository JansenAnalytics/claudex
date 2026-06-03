---
description: Scheduled-jobs dashboard — cron, systemd, what ran, what failed, upcoming runs
allowed-tools: Bash, Read
---

Report the state of Claudex's scheduled jobs. Run the commands, then summarize. No fluff.

1. **Gather** — run the cron-dash binary, falling back to the script if absent:
   - `cron-dash status` — full dashboard (cron + systemd + docker)
   - `cron-dash health` — problems only, with suggestions
   - `cron-dash errors` — recent errors across all jobs
   - `cron-dash next 12` — runs due in the next 12 hours
   - If `~/bin/cron-dash` is missing, invoke each as `node ${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/cron-dashboard/scripts/dashboard.cjs <args>`.

2. **Summarize** — one Telegram-friendly message, bullets only, no markdown tables. Lead with an overall verdict line (✅ all green / ⚠️ degraded / ❌ something broken). Cover:
   - **Scheduled** — count of active cron jobs + systemd services, all healthy?
   - **Failures** — any ❌/⚠️ jobs, stale logs (log older than 2.5× interval), or recent errors. Name the job + the symptom.
   - **Upcoming** — next few runs from `next 12` with their times.

3. **Watchdog** — explicitly confirm the watchdog cron (`watchdog-claudex.sh`, every 5 min) that keeps Claudex's tmux session alive is present and not stale. Flag loudly if it's missing or its log hasn't moved.

4. **Action items** — only if something is broken or stale. One line each: job name + the fix (e.g. `cron-dash diagnose <name>`). Omit this section entirely if everything is green. Don't pad. Don't congratulate.
