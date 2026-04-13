# Automation

Claude Code supports a rich automation system: lifecycle hooks, scheduled tasks, in-session polling loops, and cron-based scheduling. This document covers all of them with concrete examples.

---

## Hooks

Hooks let you run shell commands at specific points in Claude Code's lifecycle — session start/stop, before/after tool use. They're configured in `.claude/settings.json`.

### Available Hook Points

| Hook | When it fires |
|------|--------------|
| `SessionStart` | When a new session begins |
| `Stop` | When the session ends |
| `PreToolUse` | Before a tool executes (can block execution) |
| `PostToolUse` | After a tool executes (with matcher to filter by tool name) |

### Hook Format (CRITICAL)

> ⚠️ The format is **nested**, not flat. A common mistake is putting hooks at the wrong level.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"Session started at $(date)\" >> ~/logs/sessions.log"
          }
        ]
      }
    ]
  }
}
```

The structure is:

```
hooks → { EventName → [ { matcher, hooks: [ { type, command } ] } ] }
```

- **`matcher`** — regex pattern to filter events. Empty string (`""`) matches all.
- **`hooks`** — array of actions to run when the matcher fires.
- **`type`** — always `"command"` for shell commands.
- **`command`** — the shell command to execute.

### Example: Session Logging

Log the start and end time of every session to a file:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"START $(date -Iseconds)\" >> ~/logs/sessions.log"
          }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"STOP  $(date -Iseconds)\" >> ~/logs/sessions.log"
          }
        ]
      }
    ]
  }
}
```

### Example: Context Loading on Session Start

Automatically inject today's memory file so Claude wakes up with context:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cat ~/workspace/memory/$(date +%Y-%m-%d).md 2>/dev/null || echo 'No memory for today yet.'"
          }
        ]
      }
    ]
  }
}
```

### Example: Audit Log for Bash Commands

Use `PostToolUse` with a matcher to capture every Bash command that runs:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date -Iseconds)] BASH tool used\" >> ~/logs/tool-audit.log"
          }
        ]
      }
    ]
  }
}
```

The `matcher` is a regex applied to the tool name. Use `"Bash"` to catch shell commands, `"Write|Edit"` to catch file modifications, or `""` to catch everything.

### Example: Send ntfy Notification on Session Crash

If the session stops unexpectedly (watchdog pattern), fire a push notification:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -d 'Claude session ended' ntfy.sh/my-claude-alerts"
          }
        ]
      }
    ]
  }
}
```

### Example: Auto-Save Memory on Stop

Write a summary file when the session ends so the next session picks it up:

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"Session ended: $(date)\" >> ~/workspace/memory/$(date +%Y-%m-%d).md"
          }
        ]
      }
    ]
  }
}
```

### Production Hook Configuration

The default setup uses three hooks:

**SessionStart → `session-init.sh`**
Runs on every new session:
1. Records health event (`health-check.cjs --record session_start`)
2. Checks for interrupted tasks (`data/interrupted-task.json`)
3. Scans task inbox (`inbox.cjs --list`)
4. Rotates logs (gzip >7d, delete >30d)
5. Runs incremental memory reindex

**PostToolUse → Auto git staging**
Matches `Write|Edit` tools. Runs `git add -A` in the repo root. Keeps changes staged for easy commits.

**Stop → `session-shutdown.sh`**
Saves current state to `data/interrupted-task.json` for resume on next session. Records health event.

---

## Scheduled Tasks

### Desktop Scheduled Tasks

Desktop Scheduled Tasks are Claude Code's built-in scheduler. They run recurring tasks even when no active conversation is open — Claude wakes up, does the work, and goes back to sleep.

**Use cases:**
- Morning briefings delivered to Telegram
- Periodic GitHub / email checks
- Daily summaries or digests

**Example configuration** (natural language in Claude Code settings):

```
Every day at 8:30 AM:
  - Check weather from wttr.in
  - Check Google Calendar for today's events
  - Check GitHub notifications
  - Check disk usage and key service health
  - Send a combined summary to Telegram
```

The scheduler handles the cron math internally; you describe what you want in plain language.

### /loop — In-Session Polling

For repeated checks *during an active session*, use the `/loop` command:

```
@loop Check build status every 2 minutes
```

`/loop` will re-run the instruction on the specified interval until you stop it or the session ends. Good for:

- Watching a CI/CD pipeline
- Monitoring a deployment rollout
- Polling an API until a condition is met
- Watching log files for errors during a test run

Stop it with `/stop` or by ending the session.

### Cron-Based Scheduling

For infrastructure-level scheduling that must survive process restarts and doesn't need Claude's reasoning, use standard cron:

```bash
crontab -e
```

```cron
# Health watchdog — every 5 minutes
*/5 * * * * /home/user/scripts/health-check.sh >> /home/user/logs/health.log 2>&1

# Log rotation — every night at midnight
0 0 * * * /usr/sbin/logrotate /home/user/.logrotate.conf

# Weekly git backup — Sunday at 2 AM
0 2 * * 0 cd ~/projects && git add -A && git commit -m "weekly backup" && git push
```

Cron is best when:
- Exact timing is critical
- The task is pure shell (no LLM reasoning needed)
- You want the job isolated from Claude's session history
- The task needs to run as a system process

### Cron → Inbox → Agent Pipeline

Queue tasks from cron for the agent to process on next wake:

```bash
# Morning briefing at 8 AM
0 8 * * * node ~/.claude-agent/scripts/inbox.cjs --add "Morning briefing: check email, calendar, weather" --priority high --source cron

# Weekly code review reminder
0 10 * * 1 node ~/.claude-agent/scripts/inbox.cjs --add "Weekly code review: check open PRs" --priority normal --source cron
```

The agent sees these tasks on session start and processes them in priority order.

---

## OpenClaw Heartbeat → Claudex Equivalents

OpenClaw uses a `HEARTBEAT.md` file plus periodic polling messages to keep Claude active. In Claudex the same patterns map like this:

| OpenClaw Pattern | Claudex Equivalent |
|---|---|
| Heartbeat polling (every 30 min) | Desktop Scheduled Task |
| In-session heartbeat loop | `/loop` command |
| Infrastructure watchdog | Cron job |
| `memory/heartbeat-state.json` | Same — track last check timestamps |

**State file example** (`memory/heartbeat-state.json`):

```json
{
  "lastChecks": {
    "email": 1712600000,
    "calendar": 1712596400,
    "github": 1712590000,
    "weather": null
  }
}
```

Read this at session start (via `SessionStart` hook) and update it after each check to avoid redundant API calls.

---

## Automation Patterns

### Morning Briefing

A Desktop Scheduled Task that fires at 8:30 AM every day:

```
1. Fetch weather:    curl -s "wttr.in/?format=3"
2. Check calendar:   gcalcli agenda --nocolor (if configured)
3. GitHub notifs:    gh api notifications | jq '.[].subject.title'
4. Disk health:      df -h / | awk 'NR==2{print $5 " used"}'
5. Service status:   systemctl is-active nginx postgresql redis
6. Send to Telegram: assembled summary via message tool
```

Keep each check idempotent and fast. If one step fails, log it and continue — don't let a calendar error block the weather report.

### PR Review Bot

A Desktop Scheduled Task that runs every 2 hours during working hours:

```bash
# List open PRs without a review
gh pr list --state open --json number,title,reviews \
  | jq '.[] | select(.reviews | length == 0)'

# For each: fetch diff, analyze, post a comment
gh pr diff <number> | head -200
gh pr comment <number> --body "$(claude analyze ...)"

# Notify on Telegram if any PR is >48h old
```

Limit the diff size you feed Claude to keep costs predictable (`head -200` or similar).

### Health Monitor (Cron)

```bash
#!/bin/bash
# /home/user/scripts/health-check.sh

ALERT_URL="ntfy.sh/my-server-alerts"

# Disk usage
DISK=$(df / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$DISK" -gt 85 ]; then
  curl -s -d "⚠️ Disk at ${DISK}%" "$ALERT_URL"
fi

# Key services
for SVC in nginx postgresql redis; do
  if ! systemctl is-active --quiet "$SVC"; then
    curl -s -d "🔴 $SVC is DOWN" "$ALERT_URL"
  fi
done

# Recent errors in app log
ERRORS=$(grep -c "ERROR" /var/log/myapp/app.log 2>/dev/null || echo 0)
if [ "$ERRORS" -gt 10 ]; then
  curl -s -d "🚨 ${ERRORS} errors in app log" "$ALERT_URL"
fi
```

Register in cron:

```cron
*/5 * * * * /home/user/scripts/health-check.sh
```

---

## Choosing the Right Automation Tool

| Need | Use |
|---|---|
| React to Claude's own actions | Hook (`PostToolUse`, `PreToolUse`) |
| Run code when session starts/stops | Hook (`SessionStart`, `Stop`) |
| Daily or recurring AI-driven task | Desktop Scheduled Task |
| Watch something during active work | `/loop` |
| Reliable system-level cron job | `crontab` |
| Exact-minute timing with no LLM | Cron + shell script |

The general rule: **hooks** for event-driven reactions to Claude's own lifecycle, **Desktop Tasks** for AI-powered recurring work, **cron** for pure infrastructure.
