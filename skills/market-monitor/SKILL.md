---
name: market-monitor
description: "Watch any URL for meaningful changes — price moves, new releases (semver), hiring signals, content diffs, keyword appear/disappear — and alert. Use when tracking competitors, releases, or job postings, or detecting content changes on a web page."
category: research
maturity: stable
tags: [url-monitoring, content-diff, release-watch, hiring-signal, cron]
---

# Market Monitor Skill

Use when: watching competitors, tracking releases, monitoring job postings, or detecting content changes on any URL with intelligent signal extraction.

## Add a monitor

```
node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/add-monitor.cjs \
  --name "Name" --url "https://..." --type <type> [options]
```

## Types

- `price-change` — extracts price values, alerts on change. Use `--price-regex "\$[\d,]+"`
- `release-watch` — detects new version strings (semver)
- `hiring-signal` — detects new job titles on careers pages
- `content-diff` — diffs full page content, alerts on significant change (>3 lines)
- `keyword-watch` — watches for keywords appearing/disappearing. Use `--keywords "word1,word2"`

## Type-specific options

| Type          | Required option                                    |
| ------------- | -------------------------------------------------- |
| price-change  | `--price-regex "\$[\d,]+"` (optional, has default) |
| keyword-watch | `--keywords "kw1,kw2,kw3"` (required)              |

## Optional flags

- `--interval <minutes>` — check interval (default: 60)
- `--disabled` — add in disabled state

## Examples

```bash
# Price tracking
node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/add-monitor.cjs \
  --name "Competitor Pricing" --url "https://competitor.com/pricing" \
  --type price-change --price-regex "\$[\d,]+" --interval 60

# Release tracking
node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/add-monitor.cjs \
  --name "My Lib Releases" --url "https://github.com/owner/repo/releases" \
  --type release-watch --interval 120

# Hiring signals
node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/add-monitor.cjs \
  --name "OpenAI Careers" --url "https://openai.com/careers" \
  --type hiring-signal --interval 240

# Keyword watch
node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/add-monitor.cjs \
  --name "HN mentions" --url "https://news.ycombinator.com" \
  --type keyword-watch --keywords "sqlite,htmx,openclaw"
```

## List monitors

```
node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/list-monitors.cjs
```

## Cron

Runs every 30 minutes. Each monitor has its own interval (checked against `last_checked`).

Cron entry:

```
*/30 * * * * /usr/bin/node ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/monitor.cjs >> ${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/monitor.log 2>&1
```

## Config

`${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/config.json`

## Snapshots

`${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/snapshots/<id>.txt`
Plain text (HTML stripped), one snapshot per monitor. Created on first run as baseline.

## Alert cooldown

2 hours per monitor ID. Stored in `${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/state.json`.

## Alert channels

- Telegram: `config.telegram.chatId`
- ntfy: `config.ntfy.server` + `config.ntfy.topic`

## Log

`${MARKET_MONITOR_HOME:-$HOME/projects/market-monitor}/monitor.log`
