#!/bin/bash
# Memory curation via CRON — every 2h at :17 (crontab: 17 */2 * * *).
# Replaces the Stop-hook design, which killed the telegram poller every run:
# any `claude -p` spawn loaded the user-level telegram plugin, whose server.ts
# SIGTERMs the bot.pid holder. Full story: memory/2026-06-12.md; isolation
# layers documented in the header of scripts/memory-curate.cjs. Never wire
# memory curation back into a Stop hook.
#
# Fail-open by design: memory-curate.cjs always exits 0; failure visibility is
# handled inside it (3 consecutive model failures → warning in the daily note).

unset ANTHROPIC_API_KEY TELEGRAM_BOT_TOKEN
export HOME="${HOME:-/home/$(id -un)}"   # cron sets HOME on Linux; belt-and-braces
export PATH="$HOME/.local/bin:$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin"

LOG="$HOME/.claude-agent/logs/memory-curate.log"
mkdir -p "$(dirname "$LOG")"
{
  echo "[$(date '+%F %T')] cron scan start"
  /usr/bin/node "$HOME/.claude-agent/scripts/memory-curate.cjs" --scan
  echo "[$(date '+%F %T')] cron scan done (rc=$?)"
} >> "$LOG" 2>&1
