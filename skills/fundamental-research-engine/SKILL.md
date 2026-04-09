---
description: "SKILL=~/openclaw/skills/fundamental-research-engine/scripts"
name: fundamental-research-engine
triggers:
  - research
  - fundamental
  - daily brief
  - instrument analysis
  - rate differential
---

# Fundamental Research Engine

## Quick Start

```bash
SKILL=~/openclaw/skills/fundamental-research-engine/scripts

# Instrument research (auto-detects asset class)
python3 $SKILL/research.py EURUSD       # FX: rates + COT + retail + strength
python3 $SKILL/research.py XAUUSD       # Metal: COT + yields + F&G
python3 $SKILL/research.py BTCUSD       # Crypto: F&G
python3 $SKILL/research.py BRENT        # Energy: COT

# Daily market brief (all key instruments + macro)
python3 $SKILL/research.py --daily-brief
```

## What Each Report Includes

| Asset Class | Data Points |
|-------------|------------|
| Forex | Price, rate differential, COT, retail sentiment, currency strength |
| Metals | Price, COT, yield curve, Fear & Greed |
| Crypto | Price, Fear & Greed |
| Energy | Price, COT |
| Indices | Price, Fear & Greed |
| All | CB rates, US yields |

## Depends On
- `market-data-engine` → price data, currency strength
- `economic-data-collector` → rates, yields, calendar
- `sentiment-engine` → COT, retail, Fear & Greed
- `macro-briefing` → macro context
