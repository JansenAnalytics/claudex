#!/usr/bin/env python3
"""
Query economic data from SQLite.

Usage:
    python3 query.py yields --country US --latest
    python3 query.py rates --latest
    python3 query.py calendar --date 2026-03-18
    python3 query.py series --indicator CPI --country US --last 12
    python3 query.py rate-diff --pair EURUSD
"""
import argparse
import sys
import os
import json

sys.path.insert(0, os.path.dirname(__file__))
from db import get_conn

# Rate differential pairs
RATE_PAIRS = {
    "EURUSD": ("ECB", "Fed"),
    "GBPUSD": ("BOE", "Fed"),
    "USDJPY": ("Fed", "BOJ"),
    "AUDUSD": ("RBA", "Fed"),
    "NZDUSD": ("RBNZ", "Fed"),
    "USDCAD": ("Fed", "BOC"),
    "USDCHF": ("Fed", "SNB"),
    "EURJPY": ("ECB", "BOJ"),
    "EURGBP": ("ECB", "BOE"),
    "GBPJPY": ("BOE", "BOJ"),
    "AUDJPY": ("RBA", "BOJ"),
    "CADJPY": ("BOC", "BOJ"),
}


def query_yields(conn, country=None, latest=False, last=10):
    if latest:
        if country:
            rows = conn.execute("""
                SELECT country, date, tenor, yield_pct, change_bp
                FROM yield_curves WHERE country=?
                AND date = (SELECT MAX(date) FROM yield_curves WHERE country=?)
                ORDER BY CASE tenor WHEN '3M' THEN 1 WHEN '2Y' THEN 2 WHEN '5Y' THEN 3 WHEN '10Y' THEN 4 WHEN '30Y' THEN 5 END
            """, (country, country)).fetchall()
        else:
            rows = conn.execute("""
                SELECT country, date, tenor, yield_pct, change_bp
                FROM yield_curves
                WHERE date = (SELECT MAX(date) FROM yield_curves)
                ORDER BY country, CASE tenor WHEN '3M' THEN 1 WHEN '2Y' THEN 2 WHEN '5Y' THEN 3 WHEN '10Y' THEN 4 WHEN '30Y' THEN 5 END
            """).fetchall()
    else:
        sql = "SELECT country, date, tenor, yield_pct, change_bp FROM yield_curves"
        params = []
        if country:
            sql += " WHERE country=?"
            params.append(country)
        sql += " ORDER BY date DESC, tenor LIMIT ?"
        params.append(last * 5)
        rows = conn.execute(sql, params).fetchall()

    return [{"country": r[0], "date": r[1], "tenor": r[2], "yield": r[3], "change_bp": r[4]} for r in rows]


def query_rates(conn, latest=True):
    if latest:
        rows = conn.execute("""
            SELECT country, bank, rate, date, next_meeting
            FROM central_bank_rates
            WHERE (bank, date) IN (SELECT bank, MAX(date) FROM central_bank_rates GROUP BY bank)
            ORDER BY rate DESC
        """).fetchall()
    else:
        rows = conn.execute("SELECT country, bank, rate, date, next_meeting FROM central_bank_rates ORDER BY date DESC LIMIT 50").fetchall()

    return [{"country": r[0], "bank": r[1], "rate": r[2], "date": r[3], "next_meeting": r[4]} for r in rows]


def query_rate_differential(conn, pair):
    """Calculate rate differential for a forex pair."""
    pair = pair.upper()
    if pair not in RATE_PAIRS:
        return {"error": f"Unknown pair {pair}. Available: {', '.join(RATE_PAIRS.keys())}"}

    base_bank, quote_bank = RATE_PAIRS[pair]

    rates = {}
    for bank in [base_bank, quote_bank]:
        row = conn.execute("""
            SELECT rate FROM central_bank_rates WHERE bank=? ORDER BY date DESC LIMIT 1
        """, (bank,)).fetchone()
        rates[bank] = row[0] if row else None

    if rates[base_bank] is None or rates[quote_bank] is None:
        return {"error": "Missing rate data"}

    diff = rates[base_bank] - rates[quote_bank]
    return {
        "pair": pair,
        "base_bank": base_bank,
        "base_rate": rates[base_bank],
        "quote_bank": quote_bank,
        "quote_rate": rates[quote_bank],
        "differential_bp": round(diff * 100),
        "direction": "positive" if diff > 0 else "negative",
        "carry": f"Long {pair[:3]} earns carry" if diff > 0 else f"Short {pair[:3]} earns carry",
    }


def query_calendar(conn, date=None, country=None, impact=None):
    sql = "SELECT date, time, country, indicator, impact, actual, forecast, previous FROM calendar_events WHERE 1=1"
    params = []
    if date:
        sql += " AND date=?"
        params.append(date)
    if country:
        sql += " AND country=?"
        params.append(country.upper())
    if impact:
        sql += " AND impact=?"
        params.append(impact)
    sql += " ORDER BY date, time LIMIT 50"
    rows = conn.execute(sql, params).fetchall()
    return [{"date": r[0], "time": r[1], "country": r[2], "indicator": r[3], "impact": r[4],
             "actual": r[5], "forecast": r[6], "previous": r[7]} for r in rows]


def query_series(conn, indicator=None, country="US", last=12):
    sql = "SELECT series_id, country, indicator, date, value FROM economic_series WHERE country=?"
    params = [country]
    if indicator:
        sql += " AND indicator LIKE ?"
        params.append(f"%{indicator}%")
    sql += " ORDER BY date DESC LIMIT ?"
    params.append(last)
    rows = conn.execute(sql, params).fetchall()
    rows.reverse()
    return [{"series": r[0], "country": r[1], "indicator": r[2], "date": r[3], "value": r[4]} for r in rows]


def main():
    parser = argparse.ArgumentParser(description="Query economic data")
    parser.add_argument("command", choices=["yields", "rates", "rate-diff", "calendar", "series"])
    parser.add_argument("--country", help="Country filter")
    parser.add_argument("--latest", action="store_true")
    parser.add_argument("--last", type=int, default=12)
    parser.add_argument("--date", help="Date filter (YYYY-MM-DD)")
    parser.add_argument("--indicator", help="Indicator filter")
    parser.add_argument("--pair", help="Forex pair for rate-diff")
    parser.add_argument("--impact", help="Impact filter for calendar (High/Medium/Low)")
    parser.add_argument("--db", help="Database path")
    args = parser.parse_args()

    conn = get_conn(args.db)

    if args.command == "yields":
        data = query_yields(conn, args.country, args.latest, args.last)
    elif args.command == "rates":
        data = query_rates(conn, args.latest)
    elif args.command == "rate-diff":
        if not args.pair:
            # Show all
            data = []
            for pair in RATE_PAIRS:
                data.append(query_rate_differential(conn, pair))
        else:
            data = query_rate_differential(conn, args.pair)
    elif args.command == "calendar":
        data = query_calendar(conn, args.date, args.country, args.impact)
    elif args.command == "series":
        data = query_series(conn, args.indicator, args.country or "US", args.last)

    print(json.dumps(data, indent=2))
    conn.close()


if __name__ == "__main__":
    main()
