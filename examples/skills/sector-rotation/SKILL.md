---
description: "cd /path/to/sector-rotation"
name: sector-rotation
---

# Sector Rotation Tracker

## Quick Start

### Collect + analyze (typical workflow)
```bash
cd /path/to/sector-rotation
python3 scripts/collect.py --db data/sectors.db
```
Then use the JSON output (or DB) to write analysis per `references/analysis-prompt.md`.

### Query historical data
```bash
python3 scripts/query.py heatmap          # RS heatmap, all sectors × all periods
python3 scripts/query.py leaders --n 3    # top 3 sectors by 1M RS
python3 scripts/query.py cycle --days 90  # cycle phase history
```

## Scripts

### `scripts/collect.py` — Data Collector & Analyzer
Fetches 3 months of daily data for 17 tickers via yfinance. Computes:
- Returns and relative strength vs SPY (1W, 2W, 1M, 3M)
- Money flow proxy (OBV trend, normalized -100 to +100)
- RSI-14, 1M annualized volatility
- Market cycle phase detection (sector leadership pattern matching)
- Breadth: sectors above SPY, defensive vs cyclical flow, risk appetite
- Rotation signals: ACCELERATING, DECELERATING, RECOVERING, DETERIORATING

**Flags:** `--db PATH`, `--no-db`, `--json`
**Dependency:** `pip3 install yfinance`

### `scripts/query.py` — Database Query API
Historical queries for analysis and backtesting.

**Commands:**
- `snapshot [--date]` — full snapshot JSON
- `sector XLE --days 30 [--csv]` — single sector history
- `rankings --period 1w|2w|1m|3m` — RS rankings
- `cycle --days 90 [--csv]` — cycle phase history
- `signals --days 30` — rotation signals log
- `heatmap` — RS heatmap (all sectors, all periods)
- `leaders --n 3` / `laggards --n 3` — top/bottom sectors
- `compare XLE XLK --days 60` — head-to-head
- `breadth --days 30 [--csv]` — breadth/risk appetite history
- `export --days 365 --csv` — full export for backtests

## Database

SQLite at `data/sectors.db`. 4 tables:
- `snapshots` — full JSON per run + cycle phase + risk appetite
- `sector_series` — flat rows per sector: close, returns, RS, flow, RSI, vol
- `cycle_history` — phase, confidence, component scores, breadth metrics
- `rotation_signals` — timestamped signal log (accelerating/decelerating/etc.)

## Analysis Framework

When generating reports, read `references/analysis-prompt.md` for the full analysis template.
Read `references/cycle-model.md` for the business cycle sector rotation model (Fidelity/Stovall).

The agent writes analysis covering: cycle phase, rotation scorecard, money flow themes,
cross-asset confirmation, risk appetite, actionable rotation trades, and signals to watch.

## Integration with Other Skills

- **macro-briefing** can read sector data for cross-asset confirmation
- Other skills call `query.py` or read `data/sectors.db` directly
- JSON output from `collect.py` provides structured data for programmatic consumption

## Recommended Schedule

Weekly collection (Sunday evening or Monday pre-market) for the main rotation report.
Optional mid-week check (Wednesday) to catch intra-week shifts.

## References

- `references/analysis-prompt.md` — analysis template for report generation
- `references/cycle-model.md` — business cycle sector rotation model, thresholds, interpretation
