#!/usr/bin/env python3
"""
Technical indicator computation using pandas_ta.
Wraps pandas_ta with our standard indicator sets for swing trading.

Usage:
    from indicators import compute_swing_indicators, compute_all
"""
import pandas as pd
import pandas_ta as ta
import numpy as np


def compute_swing_indicators(df, period="daily"):
    """
    Compute the standard swing trading indicator set.
    Input df must have: open, high, low, close, volume (lowercase).
    Returns df with indicator columns added.
    """
    df = df.copy()

    # Trend
    df.ta.ema(length=9, append=True)
    df.ta.ema(length=21, append=True)
    df.ta.ema(length=50, append=True)
    df.ta.sma(length=200, append=True)
    df.ta.vwap(append=True) if "volume" in df.columns and df["volume"].sum() > 0 else None

    # Momentum
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.stoch(k=14, d=3, append=True)
    df.ta.cci(length=20, append=True)
    df.ta.willr(length=14, append=True)
    df.ta.roc(length=10, append=True)

    # Volatility
    df.ta.bbands(length=20, std=2, append=True)
    df.ta.atr(length=14, append=True)
    df.ta.kc(length=20, append=True)
    df.ta.natr(length=14, append=True)  # Normalized ATR (% of close)

    # Volume (if available)
    if "volume" in df.columns and df["volume"].sum() > 0:
        df.ta.obv(append=True)
        df.ta.ad(append=True)  # Accumulation/Distribution
        df.ta.mfi(length=14, append=True)

    # Custom: Squeeze detection (BB inside KC)
    if "BBL_20_2.0" in df.columns and "KCLe_20_1.5" in df.columns:
        df["squeeze"] = (df["BBL_20_2.0"] > df["KCLe_20_1.5"]) & (df["BBU_20_2.0"] < df["KCUe_20_1.5"])
    else:
        df["squeeze"] = False

    # Custom: EMA cross signals
    if "EMA_9" in df.columns and "EMA_21" in df.columns:
        df["ema_9_21_cross"] = np.where(
            (df["EMA_9"] > df["EMA_21"]) & (df["EMA_9"].shift(1) <= df["EMA_21"].shift(1)), 1,
            np.where(
                (df["EMA_9"] < df["EMA_21"]) & (df["EMA_9"].shift(1) >= df["EMA_21"].shift(1)), -1, 0
            )
        )

    # Custom: Trend strength (price vs EMAs alignment)
    if all(c in df.columns for c in ["EMA_9", "EMA_21", "EMA_50"]):
        df["trend_aligned"] = (
            (df["close"] > df["EMA_9"]) &
            (df["EMA_9"] > df["EMA_21"]) &
            (df["EMA_21"] > df["EMA_50"])
        ).astype(int) - (
            (df["close"] < df["EMA_9"]) &
            (df["EMA_9"] < df["EMA_21"]) &
            (df["EMA_21"] < df["EMA_50"])
        ).astype(int)

    return df


def compute_structure(df):
    """
    Compute market structure: swing highs/lows, support/resistance, trend.
    """
    df = df.copy()

    # Swing highs/lows (5-bar)
    df["swing_high"] = df["high"][(df["high"] > df["high"].shift(1)) &
                                    (df["high"] > df["high"].shift(2)) &
                                    (df["high"] > df["high"].shift(-1)) &
                                    (df["high"] > df["high"].shift(-2))]

    df["swing_low"] = df["low"][(df["low"] < df["low"].shift(1)) &
                                  (df["low"] < df["low"].shift(2)) &
                                  (df["low"] < df["low"].shift(-1)) &
                                  (df["low"] < df["low"].shift(-2))]

    # Higher highs / lower lows
    swing_highs = df["swing_high"].dropna()
    swing_lows = df["swing_low"].dropna()

    if len(swing_highs) >= 2:
        df["higher_high"] = False
        for i in range(1, len(swing_highs)):
            if swing_highs.iloc[i] > swing_highs.iloc[i-1]:
                df.loc[swing_highs.index[i], "higher_high"] = True

    if len(swing_lows) >= 2:
        df["higher_low"] = False
        for i in range(1, len(swing_lows)):
            if swing_lows.iloc[i] > swing_lows.iloc[i-1]:
                df.loc[swing_lows.index[i], "higher_low"] = True

    # Fibonacci levels from last significant swing
    if len(swing_highs) > 0 and len(swing_lows) > 0:
        last_high = swing_highs.iloc[-1]
        last_low = swing_lows.iloc[-1]
        diff = last_high - last_low

        df.attrs["fib_levels"] = {
            "high": last_high,
            "low": last_low,
            "0.236": last_low + 0.236 * diff,
            "0.382": last_low + 0.382 * diff,
            "0.500": last_low + 0.500 * diff,
            "0.618": last_low + 0.618 * diff,
            "0.786": last_low + 0.786 * diff,
        }

    return df


def compute_multi_timeframe(daily_df, h4_df=None, h1_df=None):
    """
    Multi-timeframe analysis: compute indicators on each timeframe,
    return alignment score.
    """
    results = {}

    # Daily
    daily = compute_swing_indicators(daily_df, "daily")
    last_d = daily.iloc[-1] if len(daily) > 0 else None
    if last_d is not None:
        results["daily"] = {
            "rsi": round(last_d.get("RSI_14", 50), 1),
            "macd_signal": "bullish" if last_d.get("MACDh_12_26_9", 0) > 0 else "bearish",
            "trend": int(last_d.get("trend_aligned", 0)),
            "squeeze": bool(last_d.get("squeeze", False)),
            "above_200sma": bool(last_d.get("close", 0) > last_d.get("SMA_200", 0)) if last_d.get("SMA_200") else None,
        }

    # H4
    if h4_df is not None and len(h4_df) > 0:
        h4 = compute_swing_indicators(h4_df, "h4")
        last_h4 = h4.iloc[-1]
        results["h4"] = {
            "rsi": round(last_h4.get("RSI_14", 50), 1),
            "macd_signal": "bullish" if last_h4.get("MACDh_12_26_9", 0) > 0 else "bearish",
            "trend": int(last_h4.get("trend_aligned", 0)),
            "squeeze": bool(last_h4.get("squeeze", False)),
        }

    # H1
    if h1_df is not None and len(h1_df) > 0:
        h1 = compute_swing_indicators(h1_df, "h1")
        last_h1 = h1.iloc[-1]
        results["h1"] = {
            "rsi": round(last_h1.get("RSI_14", 50), 1),
            "macd_signal": "bullish" if last_h1.get("MACDh_12_26_9", 0) > 0 else "bearish",
            "trend": int(last_h1.get("trend_aligned", 0)),
        }

    # Alignment score
    trends = [v.get("trend", 0) for v in results.values()]
    macds = [1 if v.get("macd_signal") == "bullish" else -1 for v in results.values()]

    if trends:
        results["alignment"] = {
            "trend_score": sum(trends),
            "macd_score": sum(macds),
            "aligned": all(t > 0 for t in trends) or all(t < 0 for t in trends),
            "direction": "bullish" if sum(trends) > 0 else "bearish" if sum(trends) < 0 else "mixed",
        }

    return results


def detect_divergences(df, price_col="close", indicator_col="RSI_14", lookback=20):
    """
    Detect bullish/bearish divergences between price and indicator.
    """
    divergences = []
    if indicator_col not in df.columns:
        return divergences

    for i in range(lookback, len(df)):
        window = df.iloc[i-lookback:i+1]

        # Bearish divergence: price higher high, indicator lower high
        price_highs = window.nlargest(2, price_col)
        if len(price_highs) >= 2:
            if (price_highs.iloc[0][price_col] > price_highs.iloc[1][price_col] and
                price_highs.iloc[0][indicator_col] < price_highs.iloc[1][indicator_col]):
                divergences.append({
                    "type": "bearish",
                    "index": df.index[i],
                    "price": price_highs.iloc[0][price_col],
                    "indicator": price_highs.iloc[0][indicator_col],
                })

        # Bullish divergence: price lower low, indicator higher low
        price_lows = window.nsmallest(2, price_col)
        if len(price_lows) >= 2:
            if (price_lows.iloc[0][price_col] < price_lows.iloc[1][price_col] and
                price_lows.iloc[0][indicator_col] > price_lows.iloc[1][indicator_col]):
                divergences.append({
                    "type": "bullish",
                    "index": df.index[i],
                    "price": price_lows.iloc[0][price_col],
                    "indicator": price_lows.iloc[0][indicator_col],
                })

    return divergences[-5:]  # Last 5


def generate_signal_summary(df):
    """
    Generate a concise signal summary from computed indicators.
    Returns dict with bias, signals, and key levels.
    """
    if len(df) == 0:
        return {"error": "No data"}

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    summary = {"signals": [], "levels": {}}

    # RSI
    rsi = last.get("RSI_14")
    if rsi:
        if rsi > 70:
            summary["signals"].append(f"RSI overbought ({rsi:.0f})")
        elif rsi < 30:
            summary["signals"].append(f"RSI oversold ({rsi:.0f})")

    # MACD
    macd_h = last.get("MACDh_12_26_9")
    if macd_h is not None:
        prev_macd_h = prev.get("MACDh_12_26_9", 0)
        if macd_h > 0 and prev_macd_h <= 0:
            summary["signals"].append("MACD bullish cross")
        elif macd_h < 0 and prev_macd_h >= 0:
            summary["signals"].append("MACD bearish cross")

    # Squeeze
    if last.get("squeeze"):
        summary["signals"].append("BB/KC squeeze (volatility compression)")

    # EMA cross
    if last.get("ema_9_21_cross") == 1:
        summary["signals"].append("EMA 9/21 bullish cross")
    elif last.get("ema_9_21_cross") == -1:
        summary["signals"].append("EMA 9/21 bearish cross")

    # Trend alignment
    trend = last.get("trend_aligned", 0)
    if trend == 1:
        summary["bias"] = "bullish"
    elif trend == -1:
        summary["bias"] = "bearish"
    else:
        summary["bias"] = "neutral"

    # Key levels
    if "BBU_20_2.0" in df.columns:
        summary["levels"]["bb_upper"] = round(last["BBU_20_2.0"], 5)
        summary["levels"]["bb_lower"] = round(last["BBL_20_2.0"], 5)

    if "ATRr_14" in df.columns:
        summary["levels"]["atr_14"] = round(last["ATRr_14"], 5)

    if "SMA_200" in df.columns and pd.notna(last.get("SMA_200")):
        summary["levels"]["sma_200"] = round(last["SMA_200"], 5)

    if hasattr(df, "attrs") and "fib_levels" in df.attrs:
        summary["levels"]["fib"] = {k: round(v, 5) for k, v in df.attrs["fib_levels"].items()}

    return summary
