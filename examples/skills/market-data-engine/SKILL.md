---
description: "SKILL=~/openclaw/skills/market-data-engine/scripts"
name: market-data-engine
triggers:
  - market data
  - price data
  - currency strength
  - collect data
  - fetch prices
---

# Market Data Engine

## Quick Start

```bash
SKILL=~/openclaw/skills/market-data-engine/scripts

# Collect daily data for all instruments
python3 $SKILL/collect.py --interval 1d

# Collect 1-hour data for forex majors
python3 $SKILL/collect.py --interval 1h --subclass major

# Collect 4-hour data (uses TradingView)
python3 $SKILL/collect.py --interval 4h --instruments EURUSD,GBPUSD

# Currency strength rankings
python3 $SKILL/collect.py --currency-strength --interval 1d --json

# Quick price snapshot of everything
python3 $SKILL/collect.py --snapshot --json

# Backfill 1 year of daily data
python3 $SKILL/collect.py --interval 1d --n-bars 365
```

## Query Data

```bash
# Last 30 daily bars for EURUSD
python3 $SKILL/query.py ohlcv EURUSD --interval 1d --last 30

# Latest currency strength
python3 $SKILL/query.py strength --latest

# Latest snapshots
python3 $SKILL/query.py snapshot --latest

# Database stats
python3 $SKILL/query.py stats
```

## Instruments (79 total)

| Class | Count | Examples |
|-------|-------|---------|
| Currency Indices | 8 | DXY, EXY, BXY, JXY, CXY, AXY, ZXY, SXY |
| Forex Majors | 7 | EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, USDCHF, NZDUSD |
| Forex Crosses | 21 | EURJPY, GBPJPY, AUDNZD, EURGBP, ... |
| Forex Exotics | 27 | EURNOK, USDNOK, EURSEK, USDTRY, USDZAR, ... |
| Equity Indices | 9 | SPX500, NAS100, DAX, UK100, JPN225, US30, ... |
| Metals | 2 | XAUUSD (Gold), XAGUSD (Silver) |
| Energy | 3 | BRENT, WTI, NATGAS |
| Crypto | 2 | BCH, ETH |

## Data Sources

- **yfinance** — primary for daily/hourly/minute data. Free, no API key.
- **tvdatafeed** — TradingView data. Required for 4h timeframe and currency indices. Free without login (limited).
- Auto-fallback: yfinance first, tvdatafeed fills gaps.

## Intervals

| Interval | yfinance | tvdatafeed | Max History |
|----------|----------|------------|-------------|
| 1m | ✅ | ✅ | 7 days |
| 5m | ✅ | ✅ | 60 days |
| 15m | ✅ | ✅ | 60 days |
| 30m | ✅ | ✅ | 60 days |
| 1h | ✅ | ✅ | 730 days |
| 4h | ❌ | ✅ | 5000 bars |
| 1d | ✅ | ✅ | max |
| 1w | ✅ | ✅ | max |

## Currency Strength

Tracks 8 individual currency indices from TradingView:
- Ranks currencies 1 (strongest) to 8 (weakest) by daily change
- Answers "is EURUSD moving because EUR is strong or USD is weak?"
- Query: `python3 query.py strength --latest`

## Files

```
scripts/
  symbols.py    — instrument registry (79 instruments, symbol mapping)
  db.py         — SQLite schema and helpers
  collect.py    — data collection (yfinance + tvdatafeed)
  query.py      — query interface
data/
  market.db     — SQLite database
```
