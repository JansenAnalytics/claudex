#!/usr/bin/env python3
"""
Market Data Collector — fetches OHLCV data for all instruments.
Uses yfinance as primary source, tvdatafeed as fallback for 4h and currency indices.

Usage:
    python3 collect.py --interval 1d                     # Daily bars, all instruments
    python3 collect.py --interval 1h --class forex       # Hourly, forex only
    python3 collect.py --interval 4h --instruments EURUSD,GBPUSD  # Specific instruments
    python3 collect.py --interval 1d --currency-strength  # Currency indices only
    python3 collect.py --snapshot                          # Quick price snapshot of all instruments
    python3 collect.py --interval 1d --backfill 365       # Backfill 1 year of daily data
"""

import argparse
import sys
import os
import json
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from symbols import INSTRUMENTS, CURRENCY_INDICES, INTERVALS, get_by_class
from db import get_conn, init_db, upsert_ohlcv, upsert_currency_strength, upsert_snapshots

def fetch_yfinance(instruments, interval, n_bars=500):
    """Fetch OHLCV from yfinance. Returns dict of instrument -> list of (inst, intv, dt, o, h, l, c, vol, source)."""
    import yfinance as yf

    interval_map = INTERVALS.get(interval, {})
    yf_interval = interval_map.get("yf")
    if not yf_interval:
        return {}

    # Map period based on interval + n_bars
    period_map = {
        "1m": "7d", "5m": "60d", "15m": "60d", "30m": "60d",
        "1h": "730d", "1d": "max", "1wk": "max", "1mo": "max"
    }
    period = period_map.get(yf_interval, "60d")

    results = {}
    errors = []

    # Build yf symbol list
    yf_symbols = {}
    for inst_name, inst_data in instruments.items():
        yf_sym = inst_data.get("yf")
        if yf_sym:
            yf_symbols[inst_name] = yf_sym

    if not yf_symbols:
        return {}

    # Batch download
    all_syms = list(yf_symbols.values())
    try:
        data = yf.download(all_syms, period=period, interval=yf_interval, progress=False, group_by='ticker')
    except Exception as e:
        print(f"yfinance batch download failed: {e}", file=sys.stderr)
        return {}

    for inst_name, yf_sym in yf_symbols.items():
        try:
            if len(all_syms) == 1:
                df = data
            else:
                df = data[yf_sym] if yf_sym in data.columns.get_level_values(0) else None

            if df is None or df.empty:
                errors.append(f"{inst_name}: no data")
                continue

            # Drop NaN rows
            df = df.dropna(subset=["Close"])

            rows = []
            for idx, row in df.iterrows():
                dt_str = idx.strftime("%Y-%m-%dT%H:%M:%S+00:00") if hasattr(idx, 'strftime') else str(idx)
                o = float(row.get("Open", 0) if not hasattr(row["Open"], 'values') else row["Open"].values[0]) if "Open" in row.index else 0
                h = float(row.get("High", 0) if not hasattr(row["High"], 'values') else row["High"].values[0]) if "High" in row.index else 0
                l = float(row.get("Low", 0) if not hasattr(row["Low"], 'values') else row["Low"].values[0]) if "Low" in row.index else 0
                c = float(row.get("Close", 0) if not hasattr(row["Close"], 'values') else row["Close"].values[0]) if "Close" in row.index else 0
                v = float(row.get("Volume", 0) if not hasattr(row["Volume"], 'values') else row["Volume"].values[0]) if "Volume" in row.index else 0
                rows.append((inst_name, interval, dt_str, o, h, l, c, v, "yfinance"))

            if rows:
                # Only keep last n_bars
                results[inst_name] = rows[-n_bars:]
        except Exception as e:
            errors.append(f"{inst_name}: {e}")

    if errors:
        print(f"yfinance errors: {'; '.join(errors[:10])}", file=sys.stderr)

    return results


def fetch_tvdatafeed(instruments, interval, n_bars=500):
    """Fetch OHLCV from tvdatafeed. Required for 4h and currency indices."""
    try:
        from tvDatafeed import TvDatafeed, Interval as TVInterval
    except ImportError:
        print("tvdatafeed not installed", file=sys.stderr)
        return {}

    interval_map = INTERVALS.get(interval, {})
    tv_attr = interval_map.get("tv_attr")
    if not tv_attr:
        return {}

    tv_interval = getattr(TVInterval, tv_attr, None)
    if not tv_interval:
        return {}

    tv = TvDatafeed()
    results = {}
    errors = []

    for inst_name, inst_data in instruments.items():
        tv_sym = inst_data.get("tv")
        if not tv_sym:
            continue

        symbol, exchange = tv_sym
        try:
            df = tv.get_hist(symbol, exchange, interval=tv_interval, n_bars=n_bars)
            if df is None or df.empty:
                errors.append(f"{inst_name}: no TV data")
                continue

            rows = []
            for idx, row in df.iterrows():
                dt_str = idx.strftime("%Y-%m-%dT%H:%M:%S+00:00")
                rows.append((
                    inst_name, interval, dt_str,
                    float(row["open"]), float(row["high"]), float(row["low"]), float(row["close"]),
                    float(row.get("volume", 0)),
                    "tvdatafeed"
                ))
            results[inst_name] = rows
        except Exception as e:
            errors.append(f"{inst_name}: {e}")

    if errors:
        print(f"tvdatafeed errors: {'; '.join(errors[:10])}", file=sys.stderr)

    return results


def collect_currency_strength(interval="1d", n_bars=100):
    """Fetch currency indices and compute strength rankings."""
    try:
        from tvDatafeed import TvDatafeed, Interval as TVInterval
    except ImportError:
        print("tvdatafeed required for currency strength", file=sys.stderr)
        return []

    interval_map = INTERVALS.get(interval, {})
    tv_attr = interval_map.get("tv_attr")
    tv_interval = getattr(TVInterval, tv_attr) if tv_attr else TVInterval.in_daily

    tv = TvDatafeed()
    currency_map = {
        "USD": ("DXY", "TVC"), "EUR": ("EXY", "TVC"), "GBP": ("BXY", "TVC"),
        "JPY": ("JXY", "TVC"), "CAD": ("CXY", "TVC"), "AUD": ("AXY", "TVC"),
        "NZD": ("ZXY", "TVC"), "CHF": ("SXY", "TVC"),
    }

    all_data = {}
    for ccy, (sym, exch) in currency_map.items():
        try:
            df = tv.get_hist(sym, exch, interval=tv_interval, n_bars=n_bars)
            if df is not None and not df.empty:
                all_data[ccy] = df
        except Exception as e:
            print(f"Currency index {ccy}: {e}", file=sys.stderr)

    if not all_data:
        return []

    # Build strength rows per date (normalize timestamps to date only for daily)
    rows = []

    # Normalize: for each currency, build date -> row mapping
    date_data = {}  # date_str -> {ccy: (close, change_pct)}
    for ccy, df in all_data.items():
        for i in range(len(df)):
            row = df.iloc[i]
            date_str = df.index[i].strftime("%Y-%m-%d")
            close = float(row["close"])
            chg = 0.0
            if i > 0:
                prev_close = float(df.iloc[i - 1]["close"])
                chg = ((close - prev_close) / prev_close) * 100
            if date_str not in date_data:
                date_data[date_str] = {}
            date_data[date_str][ccy] = (close, chg)

    for date_str in sorted(date_data.keys()):
        ccy_entries = date_data[date_str]
        if len(ccy_entries) < 4:  # skip dates with too few currencies
            continue

        dt_str = f"{date_str}T00:00:00+00:00"

        # Rank by change (strongest = rank 1)
        ranked = sorted(ccy_entries.items(), key=lambda x: -x[1][1])
        for rank, (ccy, (close, chg)) in enumerate(ranked, 1):
            rows.append((dt_str, interval, ccy, close, chg, rank, "tvdatafeed"))

    return rows


def collect_snapshots(instruments):
    """Quick price snapshot of all instruments via yfinance."""
    import yfinance as yf

    yf_symbols = {}
    for inst_name, inst_data in instruments.items():
        yf_sym = inst_data.get("yf")
        if yf_sym:
            yf_symbols[inst_name] = yf_sym

    if not yf_symbols:
        return []

    rows = []
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    all_syms = list(yf_symbols.values())
    try:
        data = yf.download(all_syms, period="2d", interval="1d", progress=False, group_by='ticker')
    except Exception as e:
        print(f"Snapshot download failed: {e}", file=sys.stderr)
        return []

    for inst_name, yf_sym in yf_symbols.items():
        try:
            if len(all_syms) == 1:
                df = data
            else:
                df = data[yf_sym] if yf_sym in data.columns.get_level_values(0) else None

            if df is None or df.empty or len(df) < 1:
                continue

            df = df.dropna(subset=["Close"])
            if len(df) < 1:
                continue

            last = df.iloc[-1]
            c = float(last["Close"].values[0]) if hasattr(last["Close"], 'values') else float(last["Close"])
            h = float(last["High"].values[0]) if hasattr(last["High"], 'values') else float(last["High"])
            l = float(last["Low"].values[0]) if hasattr(last["Low"], 'values') else float(last["Low"])

            chg = 0.0
            if len(df) >= 2:
                prev_c = float(df.iloc[-2]["Close"].values[0]) if hasattr(df.iloc[-2]["Close"], 'values') else float(df.iloc[-2]["Close"])
                chg = ((c - prev_c) / prev_c) * 100

            rows.append((inst_name, now_str, c, chg, h, l, "yfinance"))
        except Exception:
            continue

    return rows


def main():
    parser = argparse.ArgumentParser(description="Market Data Collector")
    parser.add_argument("--interval", default="1d", help="Timeframe: 1m,5m,15m,30m,1h,4h,1d,1w,1M")
    parser.add_argument("--instruments", help="Comma-separated instrument list")
    parser.add_argument("--class", dest="asset_class", help="Asset class filter: forex, crypto, index, commodity")
    parser.add_argument("--subclass", help="Subclass filter: major, cross, exotic, equity, metal, energy, currency_index")
    parser.add_argument("--currency-strength", action="store_true", help="Collect currency strength indices")
    parser.add_argument("--snapshot", action="store_true", help="Quick price snapshot")
    parser.add_argument("--n-bars", type=int, default=500, help="Number of bars to fetch")
    parser.add_argument("--backfill", type=int, help="Backfill N days of daily data")
    parser.add_argument("--source", default="auto", choices=["auto", "yfinance", "tvdatafeed"], help="Data source")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--dry-run", action="store_true", help="Print data without storing")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    db_path = args.db
    conn = get_conn(db_path)
    init_db(db_path)

    # Determine instrument set
    if args.instruments:
        names = [n.strip().upper() for n in args.instruments.split(",")]
        instruments = {k: v for k, v in INSTRUMENTS.items() if k in names}
    elif args.asset_class:
        instruments = get_by_class(args.asset_class)
    elif args.subclass:
        instruments = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == args.subclass}
    elif args.currency_strength:
        instruments = CURRENCY_INDICES
    else:
        instruments = INSTRUMENTS

    if args.snapshot:
        print(f"Collecting snapshots for {len(instruments)} instruments...")
        rows = collect_snapshots(instruments)
        if not args.dry_run and rows:
            upsert_snapshots(conn, rows)
        print(f"  Stored {len(rows)} snapshots")
        if args.json:
            snap_data = {r[0]: {"price": r[2], "change_pct": r[3], "high": r[4], "low": r[5]} for r in rows}
            print(json.dumps(snap_data, indent=2))
        conn.close()
        return

    if args.currency_strength:
        print(f"Collecting currency strength ({args.interval})...")
        rows = collect_currency_strength(args.interval, args.n_bars)
        if not args.dry_run and rows:
            upsert_currency_strength(conn, rows)
        n_dates = len(set(r[0] for r in rows))
        print(f"  Stored {len(rows)} strength rows ({n_dates} dates, 8 currencies)")
        if args.json:
            # Group by date, show latest
            latest_dt = max(r[0] for r in rows) if rows else None
            if latest_dt:
                latest = [r for r in rows if r[0] == latest_dt]
                latest.sort(key=lambda r: r[5])  # sort by rank
                strength = {r[2]: {"value": r[3], "change": r[4], "rank": r[5]} for r in latest}
                print(json.dumps({"date": latest_dt, "strength": strength}, indent=2))
        conn.close()
        return

    # Regular OHLCV collection
    interval = args.interval
    n_bars = args.n_bars
    if args.backfill:
        # For backfill, request max bars
        n_bars = min(args.backfill * 7, 5000)  # rough estimate for intraday

    print(f"Collecting {interval} data for {len(instruments)} instruments (n_bars={n_bars})...")

    all_rows = {}
    total_stored = 0

    # Determine source
    use_yf = args.source in ("auto", "yfinance")
    use_tv = args.source in ("auto", "tvdatafeed")

    # yfinance first (doesn't support 4h)
    if use_yf and interval != "4h":
        yf_instruments = {k: v for k, v in instruments.items() if v.get("yf")}
        if yf_instruments:
            yf_results = fetch_yfinance(yf_instruments, interval, n_bars)
            all_rows.update(yf_results)
            print(f"  yfinance: {len(yf_results)}/{len(yf_instruments)} instruments")

    # tvdatafeed for anything yfinance missed + 4h + currency indices
    if use_tv:
        missing = {k: v for k, v in instruments.items() if k not in all_rows and v.get("tv")}
        if interval == "4h":
            missing = {k: v for k, v in instruments.items() if v.get("tv")}
        if missing:
            tv_results = fetch_tvdatafeed(missing, interval, n_bars)
            all_rows.update(tv_results)
            print(f"  tvdatafeed: {len(tv_results)}/{len(missing)} instruments")

    # Store
    if not args.dry_run:
        for inst_name, rows in all_rows.items():
            if rows:
                upsert_ohlcv(conn, rows)
                total_stored += len(rows)

    print(f"  Total: {len(all_rows)} instruments, {total_stored} bars stored")

    if args.json:
        summary = {}
        for inst_name, rows in all_rows.items():
            if rows:
                last = rows[-1]
                summary[inst_name] = {
                    "last_dt": last[2], "close": last[6],
                    "bars": len(rows), "source": last[8]
                }
        print(json.dumps(summary, indent=2))

    # Log collection
    conn.execute("""
        INSERT INTO collection_log (instruments_requested, instruments_collected, source, interval)
        VALUES (?, ?, ?, ?)
    """, (len(instruments), len(all_rows), args.source, interval))
    conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
