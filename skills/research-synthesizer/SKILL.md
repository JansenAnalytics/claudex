---
description: "Synthesizes technical, fundamental, macro, and sentiment signals into conviction-scored trade ideas across forex, stocks, and crypto. Use when scanning markets for opportunities, ranking trade ideas by conviction, deciding what to trade, or asking for a buy/sell signal or setup on an instrument."
name: research-synthesizer
triggers:
  - trade idea
  - opportunity
  - conviction
  - what to trade
  - scan
  - synthesize
category: trading-finance
maturity: stable
tags: [trade-ideas, conviction-scoring, technical-analysis, fundamentals, opportunity-scan]
---

# Research Synthesizer

## Quick Start

```bash
SKILL=${CLAUDE_SKILLS_DIR:-$HOME/.claude-agent/.claude/skills}/research-synthesizer/scripts

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
