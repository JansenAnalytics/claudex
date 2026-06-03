---
description: "Generates fundamental trading research per instrument (forex, metals, crypto, energy, indices) — rate differentials, COT positioning, retail sentiment, currency strength, central-bank rates, bond yields, Fear & Greed — plus an all-instrument daily market brief. Use when analyzing an instrument's fundamentals, checking rate differentials or COT/sentiment, or producing a daily macro brief."
name: fundamental-research-engine
triggers:
  - research
  - fundamental
  - daily brief
  - instrument analysis
  - rate differential
category: trading-finance
maturity: stable
tags: [forex, cot, rate-differentials, instrument-analysis, daily-brief]
---

# Fundamental Research Engine

## Quick Start

```bash
SKILL=${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/fundamental-research-engine/scripts

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
