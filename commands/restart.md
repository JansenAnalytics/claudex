---
description: Graceful restart of Claudex with a reason logged to watchdog.log
allowed-tools: Bash
argument-hint: [reason]
---

Restart the current Claudex tmux session gracefully. The user may supply a reason as an argument; if so, log it.

Steps:

1. Read the reason from the argument (default: `"manual restart via /restart"`).
2. Append a log line to `~/.claude-agent/logs/watchdog.log` in the watchdog's format:
   ```
   [YYYY-MM-DD HH:MM:SS] 🔄 Restarting: <reason>
   ```
3. Send the user a Telegram message confirming the restart is about to happen and giving them ~3 seconds to abort if they want (don't actually wait — just inform).
4. Trigger the restart by running `bash ~/.claude-agent/scripts/restart-claudex.sh` (or, if that script doesn't exist, kill the tmux session — the watchdog cron will respawn within ~5 minutes via `bash ~/.claude-agent/scripts/start-claudex.sh`).

Notes:
- If the session is mid-task (any agent activity indicator visible: ✻, Running, Executing), warn the user once and ask for confirmation before proceeding.
- Save any in-flight state via `bash ~/.claude-agent/scripts/session-shutdown.sh` first if it exists.
- Don't leave the user hanging — the next message after restart will arrive in the new session, so make the pre-restart message complete on its own.
