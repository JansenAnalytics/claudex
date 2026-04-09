---
name: system-admin
description: System administration — manage services, processes, cron, systemd, networking. Use for any sysadmin task.
---

# System Administration

## Systemd User Services
```bash
# List running user services
systemctl --user list-units --state=running --no-pager

# Start/stop/restart
systemctl --user start SERVICE
systemctl --user stop SERVICE
systemctl --user restart SERVICE

# Enable at boot
systemctl --user enable SERVICE

# Check logs
journalctl --user -u SERVICE --since "1 hour ago" --no-pager

# Reload after editing .service file
systemctl --user daemon-reload
```

## Key Services
- `openclaw-poe-gateway` — Poe autonomous agent
- `openclaw-argus-gateway` — Argus analytical agent
- `claudex` — This Claude Code instance (when running via systemd)

## Process Management
```bash
# Find process
pgrep -fa "pattern"

# Background with setsid (survives terminal close)
setsid command &

# Kill gracefully
kill PID       # SIGTERM
kill -9 PID    # SIGKILL (last resort)
```

## Cron
```bash
# Edit crontab
crontab -e

# List current cron jobs
crontab -l

# Common patterns
# Every 5 minutes: */5 * * * *
# Daily at 9am:    0 9 * * *
# Weekly Monday:   0 9 * * 1
```

## Networking
```bash
# Check ports
ss -tlnp | grep PORT

# Test connectivity
curl -s -o /dev/null -w "%{http_code}" URL

# DNS lookup
dig HOSTNAME +short
```
