---
description: "SKILL_DIR=\"$(dirname \"$(realpath \"$0\")\")/..\"  # resolve from scripts/"
name: macro-briefing
---

# Macro Briefing

## Quick Start

### Collect + brief (one-liner)
```bash
SKILL_DIR="$(dirname "$(realpath "$0")")/.."  # resolve from scripts/
python3 scripts/collect.py && python3 scripts/briefing.py --format telegram
```

### Collect only (stores to DB)
```bash
python3 scripts/collect.py --db data/macro.db
```

### Generate briefing from latest DB snapshot
```bash
python3 scripts/briefing.py --format telegram --session europe
```

## Scripts

### `scripts/collect.py` — Data Collector
Fetches all market data via yfinance + economic calendar via FairEconomy API.
Stores in SQLite (`data/macro.db` by default). No API keys required.

**Flags:**
- `--db PATH` — custom DB path (default: `data/macro.db`)
- `--no-db` — skip DB storage, just collect
- `--json` — output raw JSON to stdout

**Dependency:** `pip3 install yfinance` (pandas, curl_cffi auto-installed)

### `scripts/briefing.py` — Briefing Formatter
Reads latest snapshot from DB (or JSON stdin) and formats for delivery.

**Flags:**
- `--format telegram|plain|json` — output format
- `--session asia|europe|us` — filter calendar events by session window
- `--db PATH` — custom DB path
- `--stdin` — read JSON from stdin instead of DB
- `--json-input PATH` — read from JSON file

**Formats:**
- `telegram` — Markdown with emoji, ready for Telegram message
- `plain` — stripped plain text
- `json` — structured JSON for programmatic use by other skills

### `scripts/query.py` — Database Query API
Historical queries for analysis, backtesting, and other skills.

**Commands:**
- `ticker DXY --days 30 [--csv]` — single ticker history
- `yields --days 60 [--csv]` — yield curve history
- `spread 10y3m --days 180` — spread history
- `snapshot [--date 2026-03-01]` — full snapshot (latest or by date)
- `calendar [--country USD] [--impact High] [--days 7]` — economic events
- `summary --days 5` — summary stats (mean/min/max/trend)
- `export --days 365 --csv` — full export for backtesting

## Database

SQLite at `data/macro.db`. Schema in `scripts/collect.py` `init_db()`.

**Tables:**
- `snapshots` — full JSON per run (for complete reconstruction)
- `market_series` — flat rows: (collected_at, ticker, close, change_pct, ...) — **use this for queries**
- `yield_curve` — dedicated curve + spread columns
- `calendar_events` — economic events with country/impact

**Indexes:** ticker+date on market_series, date on snapshots, date on calendar.

## Automated Delivery

Set up via OpenClaw cron for pre-session Telegram delivery. See `references/trading-sessions.md` for schedule.

**Example cron task (Europe open, 06:45 UTC Mon-Fri):**

> Task: Run macro-briefing collect.py then briefing.py --format telegram --session europe. Send the output to Telegram.

## Integration with Other Skills

Other skills consume macro data in three ways:

1. **Run `scripts/query.py`** — CLI for any historical query
2. **Read `data/macro.db`** directly via SQLite — full programmatic access
3. **Run `scripts/briefing.py --format json`** — structured current snapshot

**Example from another skill:**
```bash
# Get current VIX regime
python3 /path/to/macro-briefing/scripts/query.py snapshot | jq '.derived.vix_regime'

# Export 90 days of DXY for backtest
python3 /path/to/macro-briefing/scripts/query.py ticker DXY --days 90 --csv > dxy_90d.csv
```

## Adding Tickers

Edit `TICKERS` dict in `scripts/collect.py`. Any valid Yahoo Finance symbol works.
Run `collect.py` once to populate the new ticker in DB.

## References

- `references/data-sources.md` — all tickers, data sources, derived indicators, DB schema
- `references/trading-sessions.md` — session windows, delivery schedule, cron examples, key release times
