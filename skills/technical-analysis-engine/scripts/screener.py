#!/usr/bin/env python3
"""
Swing trade screener — finds setups matching specific patterns.

Usage:
    python3 screener.py                           # All setups
    python3 screener.py --setup momentum          # Momentum only
    python3 screener.py --setup reversal          # Reversal setups
    python3 screener.py --setup squeeze           # Squeeze breakout candidates
    python3 screener.py --setup trend-pullback    # Trend pullback to EMA
    python3 screener.py --asset-class forex       # Forex only
"""
import argparse, sys, os, json, sqlite3
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from indicators import compute_swing_indicators

MARKET_DB = os.path.expanduser("~/openclaw/skills/market-data-engine/data/market.db")

# Asset class mapping
ASSET_CLASSES = {
    "forex": ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
              "EURJPY", "EURGBP", "GBPJPY", "AUDJPY", "EURAUD", "EURNZD", "GBPAUD",
              "GBPNZD", "AUDNZD", "CADJPY", "CHFJPY", "AUDCAD", "AUDCHF", "CADCHF",
              "EURCHF", "EURCAD", "GBPCAD", "GBPCHF", "NZDCAD", "NZDCHF", "NZDJPY"],
    "crypto": ["BTCUSD", "ETHUSD"],
    "indices": ["SPX500", "NAS100", "DAX", "FTSE100", "NIKKEI", "DJI", "RUSSELL2000", "CAC40", "STOXX50"],
    "metals": ["XAUUSD", "XAGUSD"],
    "energy": ["BRENT", "WTI", "NATGAS"],
}


def load_daily(instrument, limit=200):
    if not os.path.exists(MARKET_DB):
        return None
    conn = sqlite3.connect(MARKET_DB)
    df = pd.read_sql_query(
        "SELECT dt as date, open, high, low, close, volume FROM ohlcv WHERE instrument=? AND interval='1d' ORDER BY dt DESC LIMIT ?",
        conn, params=(instrument, limit))
    conn.close()
    if df.empty or len(df) < 50:
        return None
    df = df.iloc[::-1].reset_index(drop=True)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def screen_momentum(df, inst):
    """Strong trend + momentum confirmation."""
    last = df.iloc[-1]
    trend = last.get("trend_aligned", 0)
    rsi = last.get("RSI_14", 50)
    macd_h = last.get("MACDh_12_26_9", 0)

    if trend == 1 and rsi > 55 and macd_h > 0:
        return {"setup": "momentum_long", "strength": round(rsi, 1), "macd_hist": round(macd_h, 5)}
    elif trend == -1 and rsi < 45 and macd_h < 0:
        return {"setup": "momentum_short", "strength": round(rsi, 1), "macd_hist": round(macd_h, 5)}
    return None


def screen_reversal(df, inst):
    """Oversold/overbought with divergence potential."""
    last = df.iloc[-1]
    rsi = last.get("RSI_14", 50)
    stoch_k = last.get("STOCHk_14_3_3", 50)

    if rsi < 30 and stoch_k < 20:
        return {"setup": "reversal_long", "rsi": round(rsi, 1), "stoch": round(stoch_k, 1)}
    elif rsi > 70 and stoch_k > 80:
        return {"setup": "reversal_short", "rsi": round(rsi, 1), "stoch": round(stoch_k, 1)}
    return None


def screen_squeeze(df, inst):
    """Bollinger Band squeeze (BB inside KC) — breakout imminent."""
    last = df.iloc[-1]
    if last.get("squeeze", False):
        # Count consecutive squeeze bars
        squeeze_count = 0
        for i in range(len(df)-1, max(0, len(df)-20), -1):
            if df.iloc[i].get("squeeze", False):
                squeeze_count += 1
            else:
                break
        return {"setup": "squeeze", "consecutive_bars": squeeze_count, "natr": round(last.get("NATR_14", 0), 2)}
    return None


def screen_trend_pullback(df, inst):
    """Trending instrument pulling back to key EMA."""
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    ema21 = last.get("EMA_21")
    ema50 = last.get("EMA_50")
    trend = last.get("trend_aligned", 0)
    close = last["close"]

    if ema21 is None or ema50 is None:
        return None

    # Bullish pullback: uptrend, price touching EMA21
    pct_from_ema21 = abs(close - ema21) / ema21 * 100
    if trend >= 0 and ema21 > ema50 and pct_from_ema21 < 0.3 and close > ema50:
        return {"setup": "pullback_long", "pct_from_ema21": round(pct_from_ema21, 2)}

    # Bearish pullback: downtrend, price touching EMA21
    if trend <= 0 and ema21 < ema50 and pct_from_ema21 < 0.3 and close < ema50:
        return {"setup": "pullback_short", "pct_from_ema21": round(pct_from_ema21, 2)}

    return None


SCREENERS = {
    "momentum": screen_momentum,
    "reversal": screen_reversal,
    "squeeze": screen_squeeze,
    "trend-pullback": screen_trend_pullback,
}


def run_screener(setup=None, asset_class=None):
    """Run screener on all instruments."""
    # Get instrument list
    if asset_class:
        instruments = ASSET_CLASSES.get(asset_class, [])
    else:
        instruments = []
        for cls in ASSET_CLASSES.values():
            instruments.extend(cls)

    screeners = {setup: SCREENERS[setup]} if setup and setup in SCREENERS else SCREENERS
    results = []

    for inst in instruments:
        df = load_daily(inst)
        if df is None:
            continue

        try:
            df = compute_swing_indicators(df)
        except Exception:
            continue

        for name, fn in screeners.items():
            try:
                signal = fn(df, inst)
                if signal:
                    last = df.iloc[-1]
                    results.append({
                        "instrument": inst,
                        "close": round(float(last["close"]), 5),
                        "rsi": round(float(last.get("RSI_14", 50)), 1),
                        "atr_pct": round(float(last.get("NATR_14", 0)), 2),
                        **signal,
                    })
            except Exception:
                continue

    return sorted(results, key=lambda x: abs(x.get("rsi", 50) - 50), reverse=True)


def main():
    parser = argparse.ArgumentParser(description="Swing trade screener")
    parser.add_argument("--setup", choices=list(SCREENERS.keys()), help="Setup type")
    parser.add_argument("--asset-class", choices=list(ASSET_CLASSES.keys()))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--top", type=int, default=15)
    args = parser.parse_args()

    results = run_screener(args.setup, args.asset_class)

    if args.json:
        print(json.dumps(results[:args.top], indent=2))
    else:
        setup_label = args.setup or "all"
        class_label = args.asset_class or "all"
        print(f"🔍 Screener: {setup_label} | Asset class: {class_label}")
        print(f"{'─'*80}")

        for r in results[:args.top]:
            setup = r.get("setup", "?")
            icon = "🟢" if "long" in setup else "🔴" if "short" in setup else "⚡"
            extra = ""
            if "consecutive_bars" in r:
                extra = f" ({r['consecutive_bars']} bars)"
            elif "pct_from_ema21" in r:
                extra = f" ({r['pct_from_ema21']:.1f}% from EMA21)"
            elif "strength" in r:
                extra = f" (RSI {r['strength']:.0f})"

            print(f"  {icon} {r['instrument']:12s} | {setup:20s} | @ {r['close']:<12} | ATR% {r['atr_pct']:>5.1f}{extra}")

        print(f"\nFound {len(results)} setups total")


if __name__ == "__main__":
    main()
