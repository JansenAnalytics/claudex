#!/usr/bin/env python3
"""
Query sentiment data.

Usage:
    python3 query.py retail --latest
    python3 query.py cot --instrument EURUSD
    python3 query.py fear-greed --latest
    python3 query.py composite --instrument XAUUSD
"""
import argparse, sys, os, json

sys.path.insert(0, os.path.dirname(__file__))
from db import get_conn

def query_retail(conn, instrument=None, latest=False):
    if latest:
        max_date = conn.execute("SELECT MAX(date) FROM retail_sentiment").fetchone()[0]
        if not max_date:
            return []
        sql = "SELECT instrument, date, long_pct, short_pct, net_sentiment, source FROM retail_sentiment WHERE date=?"
        params = [max_date]
        if instrument:
            sql += " AND instrument=?"
            params.append(instrument.upper())
        sql += " ORDER BY ABS(net_sentiment) DESC"
        rows = conn.execute(sql, params).fetchall()
    else:
        sql = "SELECT instrument, date, long_pct, short_pct, net_sentiment, source FROM retail_sentiment"
        params = []
        if instrument:
            sql += " WHERE instrument=?"
            params.append(instrument.upper())
        sql += " ORDER BY date DESC LIMIT 50"
        rows = conn.execute(sql, params).fetchall()

    return [{"instrument": r[0], "date": r[1], "long_pct": r[2], "short_pct": r[3], "net": r[4], "source": r[5],
             "signal": "contrarian_bullish" if r[4] < -20 else "contrarian_bearish" if r[4] > 20 else "neutral"}
            for r in rows]


def query_cot(conn, instrument=None, last=8):
    sql = "SELECT instrument, report_date, commercial_net, non_commercial_net, open_interest FROM cot_data"
    params = []
    if instrument:
        sql += " WHERE instrument=?"
        params.append(instrument.upper())
    sql += " ORDER BY report_date DESC LIMIT ?"
    params.append(last)
    rows = conn.execute(sql, params).fetchall()
    rows.reverse()
    return [{"instrument": r[0], "date": r[1], "commercial_net": r[2], "speculative_net": r[3], "open_interest": r[4]} for r in rows]


def query_fear_greed(conn, latest=False, index_type=None):
    if latest:
        results = []
        for itype in ["crypto_fear_greed", "cnn_fear_greed"]:
            if index_type and index_type != itype:
                continue
            row = conn.execute(
                "SELECT date, value, label FROM fear_greed WHERE index_type=? ORDER BY date DESC LIMIT 1",
                (itype,)
            ).fetchone()
            if row:
                results.append({"index": itype, "date": row[0], "value": row[1], "label": row[2]})
        return results
    else:
        rows = conn.execute(
            "SELECT date, index_type, value, label FROM fear_greed ORDER BY date DESC LIMIT 60"
        ).fetchall()
        return [{"date": r[0], "index": r[1], "value": r[2], "label": r[3]} for r in rows]


def main():
    parser = argparse.ArgumentParser(description="Query sentiment data")
    parser.add_argument("command", choices=["retail", "cot", "fear-greed", "stats"])
    parser.add_argument("--instrument", help="Instrument filter")
    parser.add_argument("--latest", action="store_true")
    parser.add_argument("--last", type=int, default=8)
    parser.add_argument("--db", help="Database path")
    args = parser.parse_args()

    conn = get_conn(args.db)

    if args.command == "retail":
        data = query_retail(conn, args.instrument, args.latest)
    elif args.command == "cot":
        data = query_cot(conn, args.instrument, args.last)
    elif args.command == "fear-greed":
        data = query_fear_greed(conn, args.latest)
    elif args.command == "stats":
        data = {
            "retail": conn.execute("SELECT COUNT(DISTINCT instrument), COUNT(*), MAX(date) FROM retail_sentiment").fetchone(),
            "cot": conn.execute("SELECT COUNT(DISTINCT instrument), COUNT(*), MAX(report_date) FROM cot_data").fetchone(),
            "fear_greed": conn.execute("SELECT COUNT(DISTINCT index_type), COUNT(*), MAX(date) FROM fear_greed").fetchone(),
        }

    print(json.dumps(data, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
