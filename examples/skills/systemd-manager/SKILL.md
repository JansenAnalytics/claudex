---
name: systemd-manager
description: Systemd Manager Skill
---

# Systemd Manager Skill

Create and manage systemd services, timers, and socket units.

## Use When

- Creating background services or daemons
- Setting up scheduled timers (modern cron alternative)
- Debugging failed units or viewing logs
- Managing service dependencies and ordering

## Quick Reference

### Service Management

```bash
# Start / stop / restart
sudo systemctl start myapp
sudo systemctl stop myapp
sudo systemctl restart myapp
sudo systemctl reload myapp          # reload config without restart

# Enable at boot / disable
sudo systemctl enable myapp
sudo systemctl enable --now myapp    # enable + start

# Status
systemctl status myapp
systemctl is-active myapp
systemctl is-enabled myapp

# List all services
systemctl list-units --type=service
systemctl list-units --type=service --state=failed

# Show unit file
systemctl cat myapp

# Reload after editing unit files
sudo systemctl daemon-reload
```

### Journalctl (Logs)

```bash
# Logs for a service
journalctl -u myapp

# Follow (tail -f equivalent)
journalctl -u myapp -f

# Last 100 lines
journalctl -u myapp -n 100

# Since time
journalctl -u myapp --since "1 hour ago"
journalctl -u myapp --since "2024-01-15 09:00"

# Only errors
journalctl -u myapp -p err

# Disk usage / vacuum
journalctl --disk-usage
sudo journalctl --vacuum-size=500M

# Boot logs
journalctl -b         # current boot
journalctl -b -1      # previous boot

# Kernel messages
journalctl -k
```

### Timers (Cron Replacement)

```bash
# List active timers
systemctl list-timers --all

# Timer unit example — runs every 15 minutes
# /etc/systemd/system/backup.timer
# [Timer]
# OnCalendar=*:0/15
# Persistent=true

# Calendar expressions:
# *:0/15         → every 15 min
# hourly         → top of every hour
# daily          → midnight
# Mon *-*-* 09:00:00  → Monday 9am
# *-*-01 00:00:00     → 1st of month

# Test calendar expression
systemd-analyze calendar "Mon *-*-* 09:00:00"
systemd-analyze calendar "*:0/15"
```

### Debugging

```bash
# Why did it fail?
systemctl status myapp
journalctl -u myapp -n 50 --no-pager

# Dependency tree
systemctl list-dependencies myapp

# Analyze boot time
systemd-analyze blame
systemd-analyze critical-chain myapp.service

# Check unit file syntax
systemd-analyze verify /etc/systemd/system/myapp.service

# Show all properties
systemctl show myapp
```

## Helper Scripts

### Generate service unit file

```bash
bash scripts/gen-service.sh <name> <exec-start> [--user <user>] [--workdir <dir>] [--env "KEY=VAL"]
# Example: bash scripts/gen-service.sh myapi "/usr/bin/node /opt/myapi/index.js" --user www-data --workdir /opt/myapi
```

### Generate timer unit

```bash
bash scripts/gen-timer.sh <name> <calendar-expr> [--description "desc"]
# Example: bash scripts/gen-timer.sh backup "daily" --description "Daily backup"
```

### Check service status summary

```bash
bash scripts/status-check.sh [service-name|--failed]
```

## Unit File Patterns

### Simple Service

```ini
[Unit]
Description=My Application
After=network.target

[Service]
Type=simple
User=myuser
WorkingDirectory=/opt/myapp
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Service with Environment File

```ini
[Service]
EnvironmentFile=/etc/myapp/env
ExecStart=/opt/myapp/bin/server
```

### Oneshot (run once, e.g. for timers)

```ini
[Service]
Type=oneshot
ExecStart=/opt/scripts/backup.sh
```

### Timer + Service Pair

```ini
# backup.timer
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target

# backup.service
[Unit]
Description=Backup job

[Service]
Type=oneshot
ExecStart=/opt/scripts/backup.sh
```

### Hardened Service

```ini
[Service]
# Security hardening
ProtectSystem=strict
ProtectHome=true
NoNewPrivileges=true
PrivateTmp=true
ReadWritePaths=/var/lib/myapp
CapabilityBoundingSet=
SystemCallFilter=@system-service
```

## Common Options

| Option     | Values                              | Purpose                |
| ---------- | ----------------------------------- | ---------------------- |
| Type       | simple, forking, oneshot, notify    | Process type           |
| Restart    | no, on-failure, always, on-abnormal | When to restart        |
| RestartSec | 5                                   | Delay between restarts |
| WantedBy   | multi-user.target, timers.target    | Install target         |
| After      | network.target, postgresql.service  | Ordering               |
| Requires   | postgresql.service                  | Hard dependency        |
| Wants      | redis.service                       | Soft dependency        |
