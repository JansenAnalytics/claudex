---
description: "SKILL=~/openclaw/skills/technical-analysis-engine/scripts"
name: technical-analysis-engine
triggers:
  - technical analysis
  - screen
  - RSI
  - MACD
  - squeeze
  - setup
  - swing trade
---

# Technical Analysis Engine

## Quick Start

```bash
SKILL=~/openclaw/skills/technical-analysis-engine/scripts

# Full analysis on any instrument
python3 $SKILL/analyze.py EURUSD
python3 $SKILL/analyze.py XAUUSD --mtf    # Multi-timeframe

# Screener — scan all instruments for setups
python3 $SKILL/screener.py                          # All setups
python3 $SKILL/screener.py --setup momentum         # Momentum only
python3 $SKILL/screener.py --setup reversal          # Oversold/overbought
python3 $SKILL/screener.py --setup squeeze           # BB/KC squeeze
python3 $SKILL/screener.py --setup trend-pullback    # EMA pullback
python3 $SKILL/screener.py --asset-class forex       # Forex only
```

## Indicators Computed
- **Trend**: EMA 9/21/50, SMA 200, VWAP, trend alignment score
- **Momentum**: RSI 14, MACD, Stochastic, CCI, Williams %R, ROC
- **Volatility**: Bollinger Bands, ATR, Keltner Channels, NATR, squeeze detection
- **Volume**: OBV, A/D, MFI
- **Structure**: Swing highs/lows, higher-high/lower-low, Fibonacci levels
- **Custom**: EMA cross signals, divergence detection, multi-TF alignment

## Structure Analysis

```bash
# Full structure analysis (BOS/CHoCH, S/R zones, OBs, FVGs, regime)
python3 $SKILL/structure.py EURUSD

# Regime classification only
python3 $SKILL/structure.py XAUUSD --regime

# Scan all instruments by regime
python3 $SKILL/structure.py --scan-regimes
```

- **BOS/CHoCH**: Break of Structure (trend continuation) and Change of Character (reversal)
- **S/R Zones**: Clustered swing points with recency-weighted strength
- **Order Blocks**: Last opposite candle before strong move (demand/supply zones)
- **Fair Value Gaps**: 3-candle imbalances price tends to revisit
- **Regime**: TRENDING_UP/DOWN, RANGING, BREAKOUT_PENDING, MEAN_REVERTING, TRANSITIONING
- **Key Level Proximity**: S/R zones, round numbers, previous day H/L/C

## Depends On
- `market-data-engine` (OHLCV data in SQLite)
- `pandas_ta` (pip package)
