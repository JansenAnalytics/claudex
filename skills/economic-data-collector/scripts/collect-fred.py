#!/usr/bin/env python3
"""
Collect US economic data from FRED (Federal Reserve Economic Data).
Requires FRED API key: set FRED_API_KEY env var or pass --api-key.
Get a free key at: https://fred.stlouisfed.org/docs/api/api_key.html

Usage:
    python3 collect-fred.py                          # All US indicators
    python3 collect-fred.py --indicator GDP,CPI      # Specific indicators
    python3 collect-fred.py --api-key YOUR_KEY       # With API key
"""
import argparse
import sys
import os
import json
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db, get_conn

# FRED series IDs for key US economic indicators
FRED_SERIES = {
    "US_GDP_QOQ":        {"series_id": "A191RL1Q225SBEA", "indicator": "GDP", "frequency": "quarterly", "desc": "Real GDP (annualized % change)"},
    "US_CPI_YOY":        {"series_id": "CPIAUCSL",        "indicator": "CPI", "frequency": "monthly",   "desc": "CPI All Items"},
    "US_CORE_CPI_YOY":   {"series_id": "CPILFESL",        "indicator": "Core CPI", "frequency": "monthly", "desc": "CPI Less Food & Energy"},
    "US_PCE_MOM":        {"series_id": "PCEPI",           "indicator": "PCE", "frequency": "monthly",   "desc": "Personal Consumption Expenditures"},
    "US_CORE_PCE":       {"series_id": "PCEPILFE",        "indicator": "Core PCE", "frequency": "monthly", "desc": "PCE Less Food & Energy"},
    "US_NFP":            {"series_id": "PAYEMS",          "indicator": "NFP", "frequency": "monthly",   "desc": "Total Nonfarm Payrolls"},
    "US_UNEMPLOYMENT":   {"series_id": "UNRATE",          "indicator": "Unemployment", "frequency": "monthly", "desc": "Unemployment Rate"},
    "US_RETAIL_SALES":   {"series_id": "RSAFS",           "indicator": "Retail Sales", "frequency": "monthly", "desc": "Advance Retail Sales"},
    "US_ISM_MFG":        {"series_id": "MANEMP",          "indicator": "ISM Manufacturing", "frequency": "monthly", "desc": "Manufacturing Employment"},
    "US_INDUSTRIAL_PROD": {"series_id": "INDPRO",         "indicator": "Industrial Production", "frequency": "monthly", "desc": "Industrial Production Index"},
    "US_HOUSING_STARTS": {"series_id": "HOUST",           "indicator": "Housing Starts", "frequency": "monthly", "desc": "Housing Starts"},
    "US_DURABLE_GOODS":  {"series_id": "DGORDER",         "indicator": "Durable Goods", "frequency": "monthly", "desc": "Durable Goods Orders"},
    "US_TRADE_BALANCE":  {"series_id": "BOPGSTB",         "indicator": "Trade Balance", "frequency": "monthly", "desc": "Trade Balance Goods & Services"},
    "US_M2":             {"series_id": "M2SL",            "indicator": "M2 Money Supply", "frequency": "monthly", "desc": "M2 Money Stock"},
    "US_FED_FUNDS":      {"series_id": "FEDFUNDS",        "indicator": "Fed Funds Rate", "frequency": "monthly", "desc": "Effective Federal Funds Rate"},
    "US_10Y_YIELD":      {"series_id": "DGS10",           "indicator": "10Y Yield", "frequency": "daily", "desc": "10-Year Treasury Yield"},
    "US_2Y_YIELD":       {"series_id": "DGS2",            "indicator": "2Y Yield", "frequency": "daily", "desc": "2-Year Treasury Yield"},
    "US_CONSUMER_CONF":  {"series_id": "UMCSENT",         "indicator": "Consumer Confidence", "frequency": "monthly", "desc": "U. of Michigan Consumer Sentiment"},
}


def fetch_fred_series(api_key, series_id, limit=120):
    """Fetch observations from FRED API."""
    import requests

    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": limit,
    }

    try:
        resp = requests.get(url, params=params, timeout=15)
        if resp.status_code != 200:
            return None, f"HTTP {resp.status_code}"
        data = resp.json()
        return data.get("observations", []), None
    except Exception as e:
        return None, str(e)


def main():
    parser = argparse.ArgumentParser(description="Collect US economic data from FRED")
    parser.add_argument("--api-key", help="FRED API key (or set FRED_API_KEY env)")
    parser.add_argument("--indicator", help="Comma-separated indicator filter")
    parser.add_argument("--limit", type=int, default=60, help="Observations per series")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("FRED_API_KEY")
    if not api_key:
        print("ERROR: FRED API key required. Set FRED_API_KEY env var or pass --api-key")
        print("Get a free key at: https://fred.stlouisfed.org/docs/api/api_key.html")
        sys.exit(1)

    conn = init_db(args.db)

    # Filter series
    series = FRED_SERIES
    if args.indicator:
        wanted = [i.strip().upper() for i in args.indicator.split(",")]
        series = {k: v for k, v in series.items() if v["indicator"].upper() in wanted or k in wanted}

    print(f"Fetching {len(series)} FRED series...")
    total_rows = 0
    errors = []

    for key, meta in series.items():
        obs, err = fetch_fred_series(api_key, meta["series_id"], args.limit)
        if err:
            errors.append(f"{key}: {err}")
            continue
        if not obs:
            continue

        rows = []
        for o in obs:
            if o.get("value") == ".":  # FRED uses "." for missing
                continue
            try:
                rows.append((
                    key, "US", meta["indicator"], meta["frequency"],
                    o["date"], float(o["value"]), None, None, None, "fred"
                ))
            except (ValueError, KeyError):
                continue

        if rows and not args.dry_run:
            conn.executemany("""
                INSERT OR REPLACE INTO economic_series
                (series_id, country, indicator, frequency, date, value, previous, forecast, surprise, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, rows)
            conn.commit()

        total_rows += len(rows)
        print(f"  {key} ({meta['indicator']}): {len(rows)} observations")

    if errors:
        print(f"\nErrors: {'; '.join(errors)}")

    print(f"\nTotal: {total_rows} rows stored")
    conn.close()


if __name__ == "__main__":
    main()
