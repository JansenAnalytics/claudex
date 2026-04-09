---
name: scheduler
description: "Natural language task scheduling for Kite. Create, list, and cancel scheduled jobs in plain English with a human-readable registry of what's running and why."
---

# Scheduler Skill

Natural language task scheduling for Kite. Create, list, and cancel scheduled jobs in plain English with a human-readable registry of what's running and why.

## Quick Trigger Phrases

| User says                                    | Kite does                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| "Schedule X every Y"                         | `node scheduler.cjs add --name "X" --every "Y" --command "..." --why "..."` |
| "Remind me to X at Y"                        | `node scheduler.cjs add --name "X" --at "Y" --command "..." --why "..."`    |
| "What's scheduled?" / "List scheduled tasks" | `node scheduler.cjs list`                                                   |
| "Cancel the morning brief" / "Remove X"      | `node scheduler.cjs remove morning-brief`                                   |
| "Check scheduler health" / "Any drift?"      | `node scheduler.cjs status`                                                 |
| "Sync the scheduler"                         | `node scheduler.cjs sync`                                                   |

## Files

- **Registry:** `~/.openclaw/schedule.json` — human-readable source of truth
- **CLI:** `~/projects/scheduler/scheduler.cjs` — manages registry + crontab
- **Skill copy:** `~/openclaw/skills/scheduler/scripts/scheduler.cjs`

## Usage

```bash
# Add a recurring task
node ~/projects/scheduler/scheduler.cjs add \
  --name "Morning brief" \
  --every "9am Monday-Friday" \
  --command "/usr/bin/node /home/ajans/scripts/brief.cjs" \
  --why "Daily summary of overnight events"

# Add a one-shot reminder
node ~/projects/scheduler/scheduler.cjs add \
  --name "Check deployment" \
  --at "2026-02-21 18:00" \
  --command "/usr/bin/node /home/ajans/scripts/check-deploy.cjs" \
  --why "Verify prod deploy went smoothly"

# List all tasks
node ~/projects/scheduler/scheduler.cjs list

# See what's in crontab vs registry
node ~/projects/scheduler/scheduler.cjs status

# Remove a task
node ~/projects/scheduler/scheduler.cjs remove morning-brief

# Fix drift (sync registry → crontab)
node ~/projects/scheduler/scheduler.cjs sync

# Show all supported time formats
node ~/projects/scheduler/scheduler.cjs help-times
```

## How It Works

1. **Registry** (`schedule.json`) is the source of truth — stores name, cron, command, why, status
2. **Crontab** is the executor — scheduler adds tagged comment blocks so it knows what it manages
3. **sync** reconciles any drift between the two
4. **status** shows what's managed vs unmanaged, and flags missing entries

## Crontab Format

Scheduler entries look like this in crontab:

```
# [scheduler] id=morning-brief name="Morning Brief"
0 9 * * 1-5 /usr/bin/node /home/ajans/scripts/brief.cjs
```

The comment tag lets the CLI track its own entries without touching others.

## References

- `references/time-formats.md` — all supported natural language patterns
- `references/cron-reference.md` — quick cron syntax reminder
