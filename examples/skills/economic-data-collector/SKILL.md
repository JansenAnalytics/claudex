---
description: "SKILL=~/openclaw/skills/economic-data-collector/scripts"
name: economic-data-collector
triggers:
  - economic data
  - yield curve
  - rate differential
  - central bank rates
  - FRED data
  - economic calendar
---

# Economic Data Collector

## Quick Start

```bash
SKILL=~/openclaw/skills/economic-data-collector/scripts

# Collect yield curves (US + major economies)
python3 $SKILL/collect-yields.py --n-bars 60

# Collect central bank rates
python3 $SKILL/collect-rates.py

# Collect US economic data from FRED (needs FRED_API_KEY env)
python3 $SKILL/collect-fred.py

# Collect economic calendar
python3 $SKILL/collect-calendar.py
```

## Query Data

```bash
# Latest yield curves by country
python3 $SKILL/query.py yields --country US --latest

# Central bank rates
python3 $SKILL/query.py rates --latest

# Rate differentials for all forex pairs
python3 $SKILL/query.py rate-diff

# Rate diff for specific pair
python3 $SKILL/query.py rate-diff --pair EURJPY

# Economic calendar for a date
python3 $SKILL/query.py calendar --date 2026-03-18

# US CPI history
python3 $SKILL/query.py series --indicator CPI --country US --last 24
```

## Data Coverage

### Central Bank Rates (8 banks)
Fed (US), ECB (EU), BOE (UK), BOJ (JP), RBA (AU), RBNZ (NZ), BOC (CA), SNB (CH)

### Rate Differentials (12 pairs)
EURUSD, GBPUSD, USDJPY, AUDUSD, NZDUSD, USDCAD, USDCHF, EURJPY, EURGBP, GBPJPY, AUDJPY, CADJPY

### FRED Series (18 US indicators)
GDP, CPI, Core CPI, PCE, Core PCE, NFP, Unemployment, Retail Sales, ISM Manufacturing,
Industrial Production, Housing Starts, Durable Goods, Trade Balance, M2, Fed Funds Rate,
10Y Yield, 2Y Yield, Consumer Confidence

### Yield Curves
- yfinance: US (3M, 5Y, 10Y, 30Y)
- TradingView: US, DE, UK, JP, AU, CA (2Y, 10Y)

## API Key
FRED requires a free API key: https://fred.stlouisfed.org/docs/api/api_key.html
Set `FRED_API_KEY` env var or pass `--api-key` flag.
