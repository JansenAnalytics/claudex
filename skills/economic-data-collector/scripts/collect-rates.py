#!/usr/bin/env python3
"""
Collect central bank interest rates.
Uses a hardcoded table updated periodically + web scraping for latest.

Usage:
    python3 collect-rates.py              # Update current rates
    python3 collect-rates.py --json       # Output as JSON
"""
import argparse
import sys
import os
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db, get_conn

# Current central bank rates (manually maintained + auto-updated via scraping)
# As of March 2026
CURRENT_RATES = {
    "Fed":  {"country": "US", "rate": 3.75, "date": "2026-03-18", "next": "2026-05-07"},
    "ECB":  {"country": "EU", "rate": 2.15, "date": "2026-03-19", "next": "2026-04-17"},
    "BOE":  {"country": "UK", "rate": 3.75, "date": "2026-03-19", "next": "2026-05-08"},
    "BOJ":  {"country": "JP", "rate": 0.75, "date": "2026-03-19", "next": "2026-04-24"},
    "RBA":  {"country": "AU", "rate": 4.10, "date": "2026-03-17", "next": "2026-04-01"},
    "RBNZ": {"country": "NZ", "rate": 3.75, "date": "2026-02-19", "next": "2026-04-09"},
    "BOC":  {"country": "CA", "rate": 2.25, "date": "2026-03-18", "next": "2026-04-16"},
    "SNB":  {"country": "CH", "rate": 0.00, "date": "2026-03-19", "next": "2026-06-19"},
}


def try_scrape_rates():
    """Try to get latest rates from tradingeconomics or similar. Returns dict updates."""
    try:
        import requests
        from bs4 import BeautifulSoup

        url = "https://www.global-rates.com/en/interest-rates/central-banks/central-banks.aspx"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return {}

        soup = BeautifulSoup(resp.text, "html.parser")
        # Parse table - structure varies, so this is best-effort
        updates = {}
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 3:
                    text = cells[0].get_text(strip=True).lower()
                    try:
                        rate = float(cells[1].get_text(strip=True).replace("%", "").replace(",", "."))
                    except (ValueError, IndexError):
                        continue

                    if "federal" in text or "fed" in text:
                        updates["Fed"] = rate
                    elif "ecb" in text or "european" in text:
                        updates["ECB"] = rate
                    elif "bank of england" in text or "boe" in text:
                        updates["BOE"] = rate
                    elif "bank of japan" in text or "boj" in text:
                        updates["BOJ"] = rate

        return updates
    except Exception as e:
        print(f"Scrape failed (non-critical): {e}", file=sys.stderr)
        return {}


def main():
    parser = argparse.ArgumentParser(description="Collect central bank rates")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--scrape", action="store_true", help="Try scraping for latest rates")
    args = parser.parse_args()

    conn = init_db(args.db)

    rates = dict(CURRENT_RATES)

    # Optionally try scraping for updates
    if args.scrape:
        updates = try_scrape_rates()
        if updates:
            print(f"Scraped {len(updates)} rate updates")
            for bank, new_rate in updates.items():
                if bank in rates and abs(rates[bank]["rate"] - new_rate) > 0.001:
                    print(f"  {bank}: {rates[bank]['rate']} → {new_rate}")
                    rates[bank]["rate"] = new_rate

    # Store
    rows = []
    for bank, data in rates.items():
        rows.append((data["country"], bank, data["rate"], data["date"], None, data.get("next")))

    conn.executemany("""
        INSERT OR REPLACE INTO central_bank_rates (country, bank, rate, date, change_bp, next_meeting)
        VALUES (?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()

    print(f"Stored {len(rows)} central bank rates:")
    for bank, data in sorted(rates.items(), key=lambda x: -x[1]["rate"]):
        print(f"  {bank} ({data['country']}): {data['rate']:.2f}% (last: {data['date']}, next: {data.get('next', '?')})")

    if args.json:
        print(json.dumps(rates, indent=2))

    conn.close()


if __name__ == "__main__":
    main()
