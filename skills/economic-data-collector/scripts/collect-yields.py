#!/usr/bin/env python3
"""
Collect yield curve data for major economies via yfinance.
Stores historical yield data in SQLite.

Usage:
    python3 collect-yields.py                    # All countries, last 30 days
    python3 collect-yields.py --country US       # US only
    python3 collect-yields.py --n-bars 365       # 1 year backfill
"""
import argparse
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db, get_conn

# Yield tickers by country and tenor
YIELD_TICKERS = {
    "US": {
        "3M":  "^IRX",
        "2Y":  "^TWXY" if False else None,  # Not available on yfinance reliably
        "5Y":  "^FVX",
        "10Y": "^TNX",
        "30Y": "^TYX",
    },
    "DE": {
        # German bunds as proxy for EU
        "10Y": "^BUND10Y" if False else None,  # yfinance doesn't have this
    },
    "UK": {
        "10Y": "^GILT10Y" if False else None,
    },
    "JP": {
        "10Y": "^JGB10Y" if False else None,
    },
}

# Reliable US yield tickers only (others need TradingView or FRED)
YF_YIELDS = {
    "US": {"3M": "^IRX", "5Y": "^FVX", "10Y": "^TNX", "30Y": "^TYX"},
}

# TradingView yield tickers for other countries
TV_YIELDS = {
    "US": {"2Y": ("US02Y", "TVC"), "3M": ("US03MY", "TVC"), "5Y": ("US05Y", "TVC"), "10Y": ("US10Y", "TVC"), "30Y": ("US30Y", "TVC")},
    "DE": {"2Y": ("DE02Y", "TVC"), "10Y": ("DE10Y", "TVC")},
    "UK": {"2Y": ("GB02Y", "TVC"), "10Y": ("GB10Y", "TVC")},
    "JP": {"2Y": ("JP02Y", "TVC"), "10Y": ("JP10Y", "TVC")},
    "AU": {"2Y": ("AU02Y", "TVC"), "10Y": ("AU10Y", "TVC")},
    "CA": {"2Y": ("CA02Y", "TVC"), "10Y": ("CA10Y", "TVC")},
}


def collect_yf_yields(n_bars=30):
    """Collect yields from yfinance."""
    import yfinance as yf

    rows = []
    for country, tenors in YF_YIELDS.items():
        for tenor, symbol in tenors.items():
            try:
                data = yf.download(symbol, period="max" if n_bars > 365 else f"{n_bars}d",
                                   interval="1d", progress=False)
                if data is None or data.empty:
                    continue
                data = data.dropna(subset=["Close"])

                prev_close = None
                for idx, row in data.iterrows():
                    close = float(row["Close"].values[0]) if hasattr(row["Close"], 'values') else float(row["Close"])
                    date_str = idx.strftime("%Y-%m-%d")
                    change_bp = None
                    if prev_close is not None:
                        change_bp = round((close - prev_close) * 100, 1)  # basis points
                    rows.append((country, date_str, tenor, close, change_bp, "yfinance"))
                    prev_close = close
            except Exception as e:
                print(f"  {country} {tenor}: {e}", file=sys.stderr)

    return rows


def collect_tv_yields(n_bars=30):
    """Collect yields from TradingView."""
    try:
        from tvDatafeed import TvDatafeed, Interval
    except ImportError:
        print("tvdatafeed not installed", file=sys.stderr)
        return []

    tv = TvDatafeed()
    rows = []

    for country, tenors in TV_YIELDS.items():
        for tenor, (symbol, exchange) in tenors.items():
            try:
                data = tv.get_hist(symbol, exchange, interval=Interval.in_daily, n_bars=n_bars)
                if data is None or data.empty:
                    continue

                prev_close = None
                for i in range(len(data)):
                    row = data.iloc[i]
                    date_str = data.index[i].strftime("%Y-%m-%d")
                    close = float(row["close"])
                    change_bp = None
                    if prev_close is not None:
                        change_bp = round((close - prev_close) * 100, 1)
                    rows.append((country, date_str, tenor, close, change_bp, "tvdatafeed"))
                    prev_close = close
            except Exception as e:
                print(f"  TV {country} {tenor}: {e}", file=sys.stderr)

    return rows


def main():
    parser = argparse.ArgumentParser(description="Collect yield curve data")
    parser.add_argument("--country", help="Country filter (US, DE, UK, JP, AU, CA)")
    parser.add_argument("--n-bars", type=int, default=30, help="Days of history")
    parser.add_argument("--source", default="all", choices=["all", "yfinance", "tvdatafeed"])
    parser.add_argument("--db", help="Database path")
    args = parser.parse_args()

    conn = init_db(args.db)

    all_rows = []

    if args.source in ("all", "yfinance"):
        print("Collecting yields from yfinance...")
        yf_rows = collect_yf_yields(args.n_bars)
        all_rows.extend(yf_rows)
        print(f"  yfinance: {len(yf_rows)} rows")

    if args.source in ("all", "tvdatafeed"):
        print("Collecting yields from TradingView...")
        tv_rows = collect_tv_yields(args.n_bars)
        all_rows.extend(tv_rows)
        print(f"  tvdatafeed: {len(tv_rows)} rows")

    # Filter by country if specified
    if args.country:
        all_rows = [r for r in all_rows if r[0] == args.country.upper()]

    # Store
    if all_rows:
        conn.executemany("""
            INSERT OR REPLACE INTO yield_curves (country, date, tenor, yield_pct, change_bp, source)
            VALUES (?, ?, ?, ?, ?, ?)
        """, all_rows)
        conn.commit()

    # Summary
    countries = set(r[0] for r in all_rows)
    tenors_per = {c: set(r[2] for r in all_rows if r[0] == c) for c in countries}
    for c in sorted(countries):
        print(f"  {c}: {', '.join(sorted(tenors_per[c]))} ({sum(1 for r in all_rows if r[0]==c)} rows)")

    print(f"Total: {len(all_rows)} yield rows stored")
    conn.close()


if __name__ == "__main__":
    main()
