---
description: "Collects and queries market sentiment data — Myfxbook retail long/short forex positioning, CFTC COT institutional net positions, and crypto/equity Fear & Greed indices — for contrarian trading signals. Use when analyzing retail positioning, COT data, fear and greed, sentiment extremes, or contrarian setups for forex, metals, energy, or crypto."
name: sentiment-engine
triggers:
  - sentiment
  - retail positioning
  - COT data
  - fear greed
  - positioning
category: trading-finance
maturity: stable
tags: [cot, myfxbook, fear-greed, retail-positioning, contrarian]
---

# Sentiment Engine

## Quick Start

```bash
SKILL=${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/sentiment-engine/scripts

# Retail sentiment (Myfxbook — 54 forex pairs)
python3 $SKILL/collect-retail.py

# COT institutional positioning (CFTC — 11 contracts)
python3 $SKILL/collect-cot.py

# Fear & Greed indices (Crypto + CNN)
python3 $SKILL/collect-fear-greed.py
```

## Query

```bash
# Latest retail sentiment (extremes = contrarian signals)
python3 $SKILL/query.py retail --latest

# COT data for specific instrument
python3 $SKILL/query.py cot --instrument EURUSD

# Fear & Greed
python3 $SKILL/query.py fear-greed --latest

# Database stats
python3 $SKILL/query.py stats
```

## Data Sources

| Source | Instruments | Update Freq | Data |
|--------|------------|-------------|------|
| Myfxbook | 54 forex pairs | Real-time | % long/short retail |
| CFTC COT | 11 (FX, metals, energy) | Weekly (Tue data, Fri release) | Institutional net positions |
| alternative.me | Crypto | Daily | Fear & Greed 0-100 |
| CNN | US Equities | Daily | Fear & Greed 0-100 |

## Contrarian Signals

Retail sentiment is a **contrarian indicator**: when >70% of retail is long, consider shorting.
- `net < -20` → contrarian bullish (retail oversold)
- `net > +20` → contrarian bearish (retail overbought)

COT: Watch for speculative net position extremes and reversals.
