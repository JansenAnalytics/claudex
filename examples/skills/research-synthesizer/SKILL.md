---
description: "SKILL=~/openclaw/skills/research-synthesizer/scripts"
name: research-synthesizer
triggers:
  - trade idea
  - opportunity
  - conviction
  - what to trade
  - scan
  - synthesize
---

# Research Synthesizer

## Quick Start

```bash
SKILL=~/openclaw/skills/research-synthesizer/scripts

# Single instrument synthesis
python3 $SKILL/synthesize.py EURUSD

# Scan all instruments for opportunities
python3 $SKILL/synthesize.py --scan

# High conviction only
python3 $SKILL/synthesize.py --scan --min-score 4

# Filter by asset class
python3 $SKILL/synthesize.py --scan --asset-class forex

# JSON output for programmatic use
python3 $SKILL/synthesize.py --scan --json
```

## Scoring System

| Component | Factors | Score Range |
|-----------|---------|-------------|
| Technical | RSI, MACD, trend alignment, EMA cross, squeeze | -5 to +5 |
| Fundamental | Rate differential, COT positioning, retail sentiment | -3 to +3 |
| Macro | Fear & Greed, yield curve | -2 to +2 |

**Conviction**: |score| ≥ 5 = high, ≥ 3 = medium, < 3 = low

## Depends On
- `technical-analysis-engine` → indicators, screener
- `fundamental-research-engine` → rates, COT, macro
- `market-data-engine` → OHLCV data
- `economic-data-collector` → rates, yields
- `sentiment-engine` → COT, retail, F&G
