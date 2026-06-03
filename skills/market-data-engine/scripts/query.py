#!/usr/bin/env python3
"""
Query market data from the SQLite database.

Usage:
    python3 query.py ohlcv EURUSD --interval 1d --last 30
    python3 query.py strength --latest
    python3 query.py snapshot --latest
    python3 query.py stats
"""
import argparse
import sys
import os
import json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from db import get_conn, DEFAULT_DB


def query_ohlcv(conn, instrument, interval="1d", last=30, since=None, until=None):
    """Query OHLCV data for an instrument."""
    sql = "SELECT dt, open, high, low, close, volume, source FROM ohlcv WHERE instrument=? AND interval=?"
    params = [instrument, interval]

    if since:
        sql += " AND dt >= ?"
        params.append(since)
    if until:
        sql += " AND dt <= ?"
        params.append(until)

    sql += " ORDER BY dt DESC"
    if last:
        sql += f" LIMIT {last}"

    rows = conn.execute(sql, params).fetchall()
    rows.reverse()  # chronological order
    return [{"dt": r[0], "open": r[1], "high": r[2], "low": r[3], "close": r[4], "volume": r[5], "source": r[6]} for r in rows]


def query_strength(conn, interval="1d", latest=False, last=10):
    """Query currency strength data."""
    if latest:
        dt = conn.execute("SELECT MAX(dt) FROM currency_strength WHERE interval=?", (interval,)).fetchone()[0]
        if not dt:
            return []
        rows = conn.execute(
            "SELECT dt, currency, index_value, change_pct, rank FROM currency_strength WHERE dt=? AND interval=? ORDER BY rank",
            (dt, interval)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT dt, currency, index_value, change_pct, rank FROM currency_strength WHERE interval=? ORDER BY dt DESC, rank LIMIT ?",
            (interval, last * 8)
        ).fetchall()

    return [{"dt": r[0], "currency": r[1], "value": r[2], "change_pct": r[3], "rank": r[4]} for r in rows]


def query_snapshots(conn, latest=False, instrument=None):
    """Query price snapshots."""
    if instrument:
        rows = conn.execute(
            "SELECT instrument, dt, price, change_pct, high, low FROM snapshots WHERE instrument=? ORDER BY dt DESC LIMIT 10",
            (instrument,)
        ).fetchall()
    elif latest:
        # Get the latest snapshot batch
        max_dt = conn.execute("SELECT MAX(dt) FROM snapshots").fetchone()[0]
        if not max_dt:
            return []
        # Get all snapshots within 5 minutes of the latest
        rows = conn.execute(
            "SELECT instrument, dt, price, change_pct, high, low FROM snapshots WHERE dt >= datetime(?, '-5 minutes') ORDER BY instrument",
            (max_dt,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT instrument, dt, price, change_pct, high, low FROM snapshots ORDER BY dt DESC LIMIT 100"
        ).fetchall()

    return [{"instrument": r[0], "dt": r[1], "price": r[2], "change_pct": r[3], "high": r[4], "low": r[5]} for r in rows]


def query_stats(conn):
    """Database statistics."""
    stats = {}

    # OHLCV stats
    ohlcv = conn.execute("""
        SELECT interval, COUNT(DISTINCT instrument) as instruments, COUNT(*) as bars,
               MIN(dt) as earliest, MAX(dt) as latest
        FROM ohlcv GROUP BY interval ORDER BY interval
    """).fetchall()
    stats["ohlcv"] = [{"interval": r[0], "instruments": r[1], "bars": r[2], "earliest": r[3], "latest": r[4]} for r in ohlcv]

    # Currency strength
    cs = conn.execute("SELECT COUNT(DISTINCT dt), COUNT(*) FROM currency_strength").fetchone()
    stats["currency_strength"] = {"dates": cs[0], "rows": cs[1]}

    # Snapshots
    snap = conn.execute("SELECT COUNT(DISTINCT instrument), COUNT(*), MAX(dt) FROM snapshots").fetchone()
    stats["snapshots"] = {"instruments": snap[0], "rows": snap[1], "latest": snap[2]}

    # Collection log
    logs = conn.execute("SELECT * FROM collection_log ORDER BY id DESC LIMIT 5").fetchall()
    stats["recent_collections"] = [{"started": r[1], "finished": r[2], "requested": r[3], "collected": r[4], "source": r[6], "interval": r[7]} for r in logs]

    # DB size
    db_path = conn.execute("PRAGMA database_list").fetchone()[2]
    if db_path and os.path.exists(db_path):
        stats["db_size_mb"] = round(os.path.getsize(db_path) / 1024 / 1024, 2)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Query Market Data")
    parser.add_argument("command", choices=["ohlcv", "strength", "snapshot", "stats"], help="Query type")
    parser.add_argument("instrument", nargs="?", help="Instrument name (for ohlcv)")
    parser.add_argument("--interval", default="1d", help="Timeframe")
    parser.add_argument("--last", type=int, default=30, help="Last N bars")
    parser.add_argument("--latest", action="store_true", help="Latest data only")
    parser.add_argument("--since", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--until", help="End date (YYYY-MM-DD)")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--format", default="json", choices=["json", "table", "csv"], help="Output format")
    args = parser.parse_args()

    conn = get_conn(args.db)

    if args.command == "ohlcv":
        if not args.instrument:
            print("Error: instrument required for ohlcv query", file=sys.stderr)
            sys.exit(1)
        data = query_ohlcv(conn, args.instrument.upper(), args.interval, args.last, args.since, args.until)
    elif args.command == "strength":
        data = query_strength(conn, args.interval, args.latest, args.last)
    elif args.command == "snapshot":
        data = query_snapshots(conn, args.latest, args.instrument)
    elif args.command == "stats":
        data = query_stats(conn)

    if args.format == "json":
        print(json.dumps(data, indent=2))
    elif args.format == "table":
        if isinstance(data, list) and data:
            keys = data[0].keys()
            # Simple table
            header = " | ".join(f"{k:>12}" for k in keys)
            print(header)
            print("-" * len(header))
            for row in data:
                print(" | ".join(f"{str(v):>12}" for v in row.values()))
        elif isinstance(data, dict):
            print(json.dumps(data, indent=2))
    elif args.format == "csv":
        if isinstance(data, list) and data:
            keys = data[0].keys()
            print(",".join(keys))
            for row in data:
                print(",".join(str(v) for v in row.values()))

    conn.close()


if __name__ == "__main__":
    main()
