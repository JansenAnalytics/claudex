#!/usr/bin/env python3
"""
Run technical analysis on any instrument from the market-data-engine.

Usage:
    python3 analyze.py EURUSD                    # Full daily analysis
    python3 analyze.py XAUUSD --timeframe 1h     # Hourly analysis
    python3 analyze.py EURUSD --mtf              # Multi-timeframe
    python3 analyze.py --scan                    # Scan all instruments for signals
    python3 analyze.py --scan --filter squeeze   # Scan for specific signal
"""
import argparse, sys, os, json, sqlite3
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from indicators import (
    compute_swing_indicators, compute_structure,
    compute_multi_timeframe, detect_divergences,
    generate_signal_summary
)
from structure import compute_full_structure

MARKET_DB = os.path.expanduser("~/openclaw/skills/market-data-engine/data/market.db")


def load_ohlcv(instrument, interval="1d", limit=300):
    """Load OHLCV from market-data-engine SQLite."""
    if not os.path.exists(MARKET_DB):
        print(f"Market DB not found: {MARKET_DB}", file=sys.stderr)
        return None

    conn = sqlite3.connect(MARKET_DB)
    df = pd.read_sql_query("""
        SELECT dt as date, open, high, low, close, volume
        FROM ohlcv WHERE instrument=? AND interval=?
        ORDER BY dt DESC LIMIT ?
    """, conn, params=(instrument.upper(), interval, limit))
    conn.close()

    if df.empty:
        return None

    df = df.iloc[::-1].reset_index(drop=True)  # Reverse to chronological
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")

    # Ensure numeric
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    return df


def analyze_instrument(instrument, timeframe="1d", mtf=False):
    """Full technical analysis for an instrument."""
    result = {"instrument": instrument, "timeframe": timeframe}

    df = load_ohlcv(instrument, timeframe)
    if df is None or len(df) < 20:
        return {"instrument": instrument, "error": f"Insufficient data (need 20+ bars, got {len(df) if df is not None else 0})"}

    # Compute indicators
    df = compute_swing_indicators(df)
    df = compute_structure(df)

    # Last bar summary
    last = df.iloc[-1]
    result["last_close"] = round(float(last["close"]), 5)
    result["last_date"] = str(df.index[-1].date())
    result["bars"] = len(df)

    # Signal summary
    result["summary"] = generate_signal_summary(df)

    # Divergences
    divs = detect_divergences(df)
    if divs:
        result["divergences"] = [{"type": d["type"], "date": str(d["index"].date()), "indicator_val": round(d["indicator"], 1)} for d in divs]

    # Performance stats
    close = df["close"]
    result["performance"] = {
        "1d_change": round(float((close.iloc[-1] / close.iloc[-2] - 1) * 100), 2) if len(close) > 1 else None,
        "5d_change": round(float((close.iloc[-1] / close.iloc[-6] - 1) * 100), 2) if len(close) > 5 else None,
        "20d_change": round(float((close.iloc[-1] / close.iloc[-21] - 1) * 100), 2) if len(close) > 20 else None,
    }

    # Key indicator values
    indicators = {}
    for col in ["RSI_14", "MACDh_12_26_9", "ATRr_14", "NATR_14", "STOCHk_14_3_3", "CCI_20_0.015", "WILLR_14"]:
        if col in df.columns and pd.notna(last.get(col)):
            indicators[col] = round(float(last[col]), 2)
    result["indicators"] = indicators

    # Fib levels
    if hasattr(df, "attrs") and "fib_levels" in df.attrs:
        result["fib_levels"] = {k: round(v, 5) for k, v in df.attrs["fib_levels"].items()}

    # Structure analysis
    struct = compute_full_structure(df)
    result["regime"] = struct["regime"]
    result["structure_trend"] = struct["structure_trend"]
    result["sr_zones"] = struct["sr_zones"][:5]
    result["order_blocks"] = struct["order_blocks"][:3]
    result["fair_value_gaps"] = struct["fair_value_gaps"][:3]
    result["nearby_levels"] = struct["nearby_levels"][:5]
    result["recent_structure_events"] = struct["recent_events"]

    # Multi-timeframe
    if mtf:
        h4_df = load_ohlcv(instrument, "4h")
        h1_df = load_ohlcv(instrument, "1h")
        result["mtf"] = compute_multi_timeframe(df, h4_df, h1_df)

    return result


def scan_instruments(signal_filter=None):
    """Scan all instruments for signals."""
    if not os.path.exists(MARKET_DB):
        return []

    conn = sqlite3.connect(MARKET_DB)
    instruments = [r[0] for r in conn.execute(
        "SELECT DISTINCT instrument FROM ohlcv WHERE interval='1d' GROUP BY instrument HAVING COUNT(*) > 50"
    ).fetchall()]
    conn.close()

    results = []
    for inst in instruments:
        try:
            analysis = analyze_instrument(inst, "1d")
            if "error" in analysis:
                continue

            signals = analysis.get("summary", {}).get("signals", [])
            bias = analysis.get("summary", {}).get("bias", "neutral")

            if signal_filter:
                if not any(signal_filter.lower() in s.lower() for s in signals):
                    continue

            if signals or bias != "neutral":
                results.append({
                    "instrument": inst,
                    "bias": bias,
                    "signals": signals,
                    "rsi": analysis.get("indicators", {}).get("RSI_14"),
                    "last_close": analysis.get("last_close"),
                    "5d_change": analysis.get("performance", {}).get("5d_change"),
                })
        except Exception as e:
            continue

    # Sort by signal count (most signals first)
    results.sort(key=lambda x: len(x["signals"]), reverse=True)
    return results


def main():
    parser = argparse.ArgumentParser(description="Technical analysis engine")
    parser.add_argument("instrument", nargs="?", help="Instrument symbol")
    parser.add_argument("--timeframe", "-tf", default="1d", choices=["1h", "4h", "1d"])
    parser.add_argument("--mtf", action="store_true", help="Multi-timeframe analysis")
    parser.add_argument("--scan", action="store_true", help="Scan all instruments")
    parser.add_argument("--filter", help="Signal filter for scan")
    parser.add_argument("--top", type=int, default=20, help="Max results for scan")
    args = parser.parse_args()

    if args.scan:
        results = scan_instruments(args.filter)
        print(f"Found {len(results)} instruments with signals:\n")
        for r in results[:args.top]:
            signals_str = ", ".join(r["signals"][:3]) if r["signals"] else "trend only"
            print(f"  {r['instrument']:12s} | {r['bias']:8s} | RSI {r['rsi'] or '?':>5} | 5d {r['5d_change'] or 0:+.1f}% | {signals_str}")
        print(f"\nTotal: {len(results)}")
    elif args.instrument:
        result = analyze_instrument(args.instrument, args.timeframe, args.mtf)
        print(json.dumps(result, indent=2, default=str))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
