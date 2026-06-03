---
name: pr-monitor
description: PR / CI Monitor Skill
category: development
maturity: stable
tags: [github, ci-monitoring, pull-requests, cron, alerts]
---

# PR / CI Monitor Skill

Use when: checking GitHub repo health, investigating why an alert fired, or adding a new repo to watch.

## Check status of all repos now

node ${PR_MONITOR_HOME:-$HOME/projects/pr-monitor}/status.cjs

## Run monitor now (dry run)

node ${PR_MONITOR_HOME:-$HOME/projects/pr-monitor}/monitor.cjs --dry-run

## Run monitor and send real alerts if needed

node ${PR_MONITOR_HOME:-$HOME/projects/pr-monitor}/monitor.cjs

## Cron

Runs every 30 minutes.

## What it watches

- CI failures on main/master branch
- Open PRs awaiting review for >24h (non-draft, non-WIP)
- Open PRs with failing CI checks
- Stale PRs (no activity in 7 days)

## Repos watched

All JansenAnalytics repos (auto-discovered). Exclusions in config.json.

## Alert cooldown

4 hours per issue — won't spam on persistent failures.

## Config

${PR_MONITOR_HOME:-$HOME/projects/pr-monitor}/config.json

## Add a new repo (force-include)

node ${PR_MONITOR_HOME:-$HOME/projects/pr-monitor}/add-repo.cjs JansenAnalytics/some-new-repo

## Files

- monitor.cjs — main cron script
- status.cjs — status table (reads last-run.json)
- add-repo.cjs — force-add a repo to config
- config.json — settings, exclusions, cooldowns
- state.json — cooldown tracking (auto-managed)
- last-run.json — last run results (read by status.cjs)
- monitor.log — log file
