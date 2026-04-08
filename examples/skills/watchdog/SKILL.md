---
name: watchdog
description: Monitor system health — check services, disk usage, processes, logs. Use when asked about system status or health.
---

# System Health Watchdog

## Quick Health Check
```bash
# Disk usage
df -h / /home | tail -2

# Memory
free -h

# CPU load
uptime

# Running services
systemctl --user list-units --state=running --no-pager | head -20

# Check specific services
systemctl --user status openclaw-poe-gateway openclaw-argus-gateway 2>&1 | grep -E "●|Active:"

# Large files
dust -n 10 /home/ajans

# Network connectivity
curl -s -o /dev/null -w "%{http_code}" https://api.telegram.org
```

## Process Monitoring
```bash
# Check if a process is running
pgrep -fa "PROCESS_NAME"

# Top CPU consumers
ps aux --sort=-%cpu | head -10

# Top memory consumers
ps aux --sort=-%mem | head -10
```

## Log Checking
```bash
# Recent system errors
journalctl --user --since "1 hour ago" --priority err --no-pager | tail -20

# Check specific log
tail -50 /path/to/logfile | grep -i "error\|fail\|crash"
```

## Key Services to Monitor
- openclaw main gateway (systemd)
- openclaw-poe-gateway (systemd user)
- openclaw-argus-gateway (systemd user)
- Claude Code session (this instance)
