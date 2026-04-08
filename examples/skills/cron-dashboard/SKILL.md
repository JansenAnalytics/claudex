---
name: cron-dashboard
user-invocable: false
description: Unified dashboard for all cron jobs, systemd services, and Docker containers. Shows schedules, health status, log freshness, errors, upcoming runs, and diagnostics. Use when checking what's scheduled, what's running, what failed, or managing cron jobs.
triggers:
  - cron
  - scheduled jobs
  - what's running
  - crontab
  - service status
  - job health
  - cron dashboard
  - check services
  - what failed
---

# Cron Dashboard

Unified view of all scheduled jobs, systemd services, and Docker containers with health monitoring.

**Binary:** `~/bin/cron-dash` (or `node ~/openclaw/skills/cron-dashboard/scripts/dashboard.cjs`)

## Quick Reference

```bash
cron-dash status           # Full dashboard
cron-dash health           # Health check (problems only)
cron-dash next 12          # Upcoming runs in next 12 hours
cron-dash errors           # Recent errors across all jobs
cron-dash diagnose monitor # Deep diagnosis of a job
cron-dash logs runner 50   # Last 50 lines of a job's log
```

## Commands

### `status` — Full Dashboard
```bash
cron-dash status
```
Shows everything at a glance:
- All cron jobs with schedule, log age, size, error count, health status
- Systemd services (user + system scope) — only our custom ones
- Docker containers with status
- Summary counts

Health statuses:
| Status | Meaning |
|--------|---------|
| ✅ healthy | Log updated within expected interval, no errors |
| ⚠️ warning | Some errors in recent log lines |
| ❌ error | Many errors (>5) in recent log output |
| ⏰ stale | Log not updated in 2.5× expected interval |
| ❓ unknown | No log file configured or found |
| ◌ disabled | Cron entry is commented out |

### `health` — Problems Only
```bash
cron-dash health
```
Shows only jobs with issues + actionable suggestions for each.

### `next [hours]` — Upcoming Runs
```bash
cron-dash next          # Next 6 hours (default)
cron-dash next 24       # Next 24 hours
cron-dash next 1        # Next hour
```

### `errors [name]` — Recent Errors
```bash
cron-dash errors              # All jobs
cron-dash errors monitor      # Filter by name
```
Scans last 100 lines of each log for error patterns (error, fail, exception, timeout, refused, etc.).

### `diagnose <name>` — Deep Diagnosis
```bash
cron-dash diagnose scan
cron-dash diagnose monitor
```
Full investigation:
- Schedule and command details
- Log analysis (size, freshness, error count, last line)
- Script existence + permissions check
- Binary/dependency check
- Running process check
- Disk space check
- Actionable suggestions

### `logs [name] [lines]` — View Logs
```bash
cron-dash logs               # All job logs
cron-dash logs runner         # Specific job
cron-dash logs runner 100     # Last 100 lines
```

### `history [name]` — Activity Heatmap
```bash
cron-dash history
cron-dash history runner
```
Shows run frequency per day as a bar chart from log timestamps.

### `crons` — Detailed Cron List
```bash
cron-dash crons
```
Shows every crontab entry with human-readable schedule, command, log file, and comments.

### `services` — Service Details
```bash
cron-dash services
```
Lists systemd services + Docker containers with recent journal entries.

### `add` — Add Cron Job
```bash
cron-dash add "*/15 * * * *" "node ~/scripts/check.cjs >> ~/logs/check.log 2>&1" --name "health-check"
```

### `remove` — Remove Cron Entries
```bash
cron-dash remove "vuln-scanner"   # Removes entries containing this pattern
```

### `disable` / `enable` — Toggle Entries
```bash
cron-dash disable "web-monitor"   # Comments out matching entries
cron-dash enable "web-monitor"    # Uncomments them
```

### `export` — JSON Export
```bash
cron-dash export                   # Full dashboard as JSON
cron-dash export > /tmp/dash.json  # Save to file
```

## What It Monitors

### Cron Jobs
- Parses `crontab -l` for all entries
- Detects schedule, command, log file, working directory
- Generates human-readable schedule descriptions
- Calculates expected run intervals
- Checks log freshness vs expected interval
- Scans logs for error patterns
- Computes next scheduled runs

### Systemd Services
- Lists user-scope services (openclaw, riften, etc.)
- Lists system-scope services (docker, etc.)
- Shows active/inactive/failed status
- Fetches recent journal entries

### Docker Containers
- Lists all containers (running + stopped)
- Shows status, image, ports

## Health Detection Logic

1. **Stale detection**: If `log_age > interval × 2.5` → stale
   - Every-minute jobs: stale after 2.5 min
   - Every-15-min jobs: stale after 37.5 min
   - Daily jobs: stale after 2.5 days
   - Weekly jobs: stale after 8+ days
2. **Error detection**: Scans last 100 log lines for error keywords
   - 0 errors → healthy
   - 1-5 errors → warning
   - 6+ errors → error
3. **Unknown**: No log file path in cron command or log file missing

## Agent Usage

### During heartbeats
```bash
# Quick health check — only shows problems
cron-dash health
```

### When user asks "what's running?"
```bash
cron-dash status
```

### When user asks "why isn't X working?"
```bash
cron-dash diagnose <name>
```

### When setting up a new cron
```bash
cron-dash add "0 */4 * * *" "cd ~/projects/myapp && python3 sync.py >> logs/sync.log 2>&1" --name "myapp-sync"
cron-dash status  # Verify it appears
```
