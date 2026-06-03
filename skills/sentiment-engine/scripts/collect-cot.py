#!/usr/bin/env python3
"""
Collect Commitment of Traders (COT) data from CFTC.
Shows institutional positioning in futures — key for FX and commodities.

Usage:
    python3 collect-cot.py                # Collect latest COT data
    python3 collect-cot.py --json         # Output as JSON
"""
import argparse, sys, os, json, io, zipfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db

# CFTC COT contract codes for our instruments
COT_CONTRACTS = {
    "EURUSD":  {"code": "099741", "name": "EURO FX"},
    "GBPUSD":  {"code": "096742", "name": "BRITISH POUND"},
    "USDJPY":  {"code": "097741", "name": "JAPANESE YEN"},
    "AUDUSD":  {"code": "232741", "name": "AUSTRALIAN DOLLAR"},
    "NZDUSD":  {"code": "112741", "name": "NEW ZEALAND DOLLAR"},
    "USDCAD":  {"code": "090741", "name": "CANADIAN DOLLAR"},
    "USDCHF":  {"code": "092741", "name": "SWISS FRANC"},
    "XAUUSD":  {"code": "088691", "name": "GOLD"},
    "XAGUSD":  {"code": "084691", "name": "SILVER"},
    "BRENT":   {"code": None,     "name": "BRENT CRUDE"},  # ICE, different report
    "WTI":     {"code": "067651", "name": "CRUDE OIL, LIGHT SWEET"},
    "NATGAS":  {"code": "023651", "name": "NAT GAS"},
}

# CFTC data URL
COT_URL = "https://www.cftc.gov/dea/newcot/deafut.txt"
COT_ZIP_URL = "https://www.cftc.gov/files/dea/history/deacot2026.zip"  # Current year


def fetch_cot_current():
    """Fetch latest COT report from CFTC deafut.txt (futures-only)."""
    import requests

    try:
        resp = requests.get(COT_URL, timeout=30)
        if resp.status_code != 200:
            print(f"CFTC returned {resp.status_code}", file=sys.stderr)
            return []

        lines = resp.text.strip().split("\n")
        results = []

        # Build code -> instrument lookup
        code_map = {meta["code"]: inst for inst, meta in COT_CONTRACTS.items() if meta.get("code")}

        for line in lines:
            parts = [p.strip().strip('"') for p in line.split(",")]
            if len(parts) < 15:
                continue

            # Format: name, date_yymmdd, as_of_date, cftc_code, exchange, ...
            # Field indices (0-based):
            #   3 = CFTC contract code
            #   7 = Open Interest
            #   8 = Non-Commercial Long
            #   9 = Non-Commercial Short
            #  10 = Non-Commercial Spreading (ignored)
            #  11 = Commercial Long
            #  12 = Commercial Short
            cftc_code = parts[3].strip() if len(parts) > 3 else ""
            as_of_date = parts[2].strip() if len(parts) > 2 else ""

            if cftc_code not in code_map:
                continue

            instrument = code_map[cftc_code]
            try:
                results.append({
                    "instrument": instrument,
                    "report_date": as_of_date,
                    "open_interest": int(parts[7]),
                    "non_commercial_long": int(parts[8]),
                    "non_commercial_short": int(parts[9]),
                    "commercial_long": int(parts[11]),
                    "commercial_short": int(parts[12]),
                })
            except (ValueError, IndexError) as e:
                print(f"  Parse error for {instrument}: {e}", file=sys.stderr)
                continue

        return results
    except Exception as e:
        print(f"CFTC fetch failed: {e}", file=sys.stderr)
        return []


def fetch_cot_quandl():
    """Alternative: fetch COT from Nasdaq Data Link (formerly Quandl) — free tier."""
    try:
        import requests

        results = []
        for instrument, meta in COT_CONTRACTS.items():
            if not meta["code"]:
                continue

            # Quandl CFTC dataset
            url = f"https://data.nasdaq.com/api/v3/datasets/CFTC/{meta['code']}_F_ALL.json?rows=4"
            resp = requests.get(url, timeout=15)
            if resp.status_code != 200:
                continue

            data = resp.json().get("dataset", {})
            columns = data.get("column_names", [])
            rows_data = data.get("data", [])

            if not rows_data:
                continue

            for row in rows_data[:4]:  # Last 4 weeks
                row_dict = dict(zip(columns, row))
                results.append({
                    "instrument": instrument,
                    "report_date": row_dict.get("Date", ""),
                    "commercial_long": int(row_dict.get("Commercial Long", 0)),
                    "commercial_short": int(row_dict.get("Commercial Short", 0)),
                    "non_commercial_long": int(row_dict.get("Noncommercial Long", 0)),
                    "non_commercial_short": int(row_dict.get("Noncommercial Short", 0)),
                    "open_interest": int(row_dict.get("Open Interest", 0)),
                })

        return results
    except Exception as e:
        print(f"Quandl COT failed: {e}", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser(description="Collect COT data")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--source", default="cftc", choices=["cftc", "quandl", "both"])
    args = parser.parse_args()

    conn = init_db(args.db)

    print("Collecting COT data...")
    results = []

    if args.source in ("cftc", "both"):
        print("  Trying CFTC direct...")
        results = fetch_cot_current()

    if not results and args.source in ("quandl", "both"):
        print("  Trying Quandl/Nasdaq Data Link...")
        results = fetch_cot_quandl()

    if results:
        rows = []
        for r in results:
            net_nc = r["non_commercial_long"] - r["non_commercial_short"]
            net_c = r["commercial_long"] - r["commercial_short"]
            rows.append((
                r["instrument"], r["report_date"],
                r["commercial_long"], r["commercial_short"], net_c,
                r["non_commercial_long"], r["non_commercial_short"], net_nc,
                r["open_interest"], "cftc"
            ))

        conn.executemany("""
            INSERT OR REPLACE INTO cot_data
            (instrument, report_date, commercial_long, commercial_short, commercial_net,
             non_commercial_long, non_commercial_short, non_commercial_net, open_interest, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, rows)
        conn.commit()

        print(f"  Stored {len(results)} COT records")
        for r in results:
            net = r["non_commercial_long"] - r["non_commercial_short"]
            print(f"    {r['instrument']}: spec net={net:+,d} | OI={r['open_interest']:,d}")
    else:
        print("  No COT data collected (CFTC format may have changed)")

    if args.json:
        print(json.dumps(results, indent=2, default=str))

    conn.close()


if __name__ == "__main__":
    main()
