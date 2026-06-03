#!/usr/bin/env python3
"""
Collect retail trader sentiment from Myfxbook.
Shows % long/short for major forex pairs — contrarian indicator.

Usage:
    python3 collect-retail.py              # Collect current sentiment
    python3 collect-retail.py --json       # Output as JSON
"""
import argparse, sys, os, json, re
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db

def scrape_myfxbook():
    """Scrape retail sentiment from Myfxbook community outlook."""
    try:
        import cloudscraper
        from bs4 import BeautifulSoup

        url = "https://www.myfxbook.com/community/outlook"
        scraper = cloudscraper.create_scraper()
        resp = scraper.get(url, timeout=20)
        if resp.status_code != 200:
            print(f"Myfxbook returned {resp.status_code}", file=sys.stderr)
            return []

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []

        # Myfxbook has sentiment data in table rows or JS data
        # Try parsing the outlook table
        tables = soup.find_all("table")
        for table in tables:
            rows = table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) >= 3:
                    symbol_text = cells[0].get_text(strip=True).upper().replace("/", "")
                    # Extract percentages
                    try:
                        long_text = cells[1].get_text(strip=True)
                        short_text = cells[2].get_text(strip=True)
                        long_pct = float(re.search(r'[\d.]+', long_text).group())
                        short_pct = float(re.search(r'[\d.]+', short_text).group())
                        if 0 < long_pct < 100 and 0 < short_pct < 100:
                            results.append({
                                "instrument": symbol_text,
                                "long_pct": long_pct,
                                "short_pct": short_pct,
                                "net": long_pct - short_pct,
                            })
                    except (ValueError, AttributeError):
                        continue

        return results
    except Exception as e:
        print(f"Myfxbook scrape failed: {e}", file=sys.stderr)
        return []


def scrape_myfxbook_api():
    """Try Myfxbook's JSON API endpoint."""
    try:
        import requests
        url = "https://www.myfxbook.com/community/outlook/data"
        headers = {
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://www.myfxbook.com/community/outlook",
        }
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code == 200:
            try:
                data = resp.json()
                results = []
                symbols = data.get("symbols", data.get("data", []))
                if isinstance(symbols, list):
                    for item in symbols:
                        if isinstance(item, dict):
                            sym = item.get("name", item.get("symbol", "")).upper().replace("/", "")
                            long_pct = item.get("longPercentage", item.get("long", 0))
                            short_pct = item.get("shortPercentage", item.get("short", 0))
                            if sym and long_pct and short_pct:
                                results.append({
                                    "instrument": sym,
                                    "long_pct": float(long_pct),
                                    "short_pct": float(short_pct),
                                    "net": float(long_pct) - float(short_pct),
                                })
                return results
            except json.JSONDecodeError:
                pass
        return []
    except Exception:
        return []


def main():
    parser = argparse.ArgumentParser(description="Collect retail sentiment")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    conn = init_db(args.db)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print("Collecting retail sentiment from Myfxbook...")

    # Try API first, fall back to scraping
    results = scrape_myfxbook_api()
    if not results:
        results = scrape_myfxbook()

    if results:
        rows = [(r["instrument"], now, r["long_pct"], r["short_pct"], r["net"], "myfxbook") for r in results]
        conn.executemany("""
            INSERT OR REPLACE INTO retail_sentiment (instrument, date, long_pct, short_pct, net_sentiment, source)
            VALUES (?, ?, ?, ?, ?, ?)
        """, rows)
        conn.commit()

        print(f"  Stored {len(results)} instruments")
        # Show extremes
        sorted_by_net = sorted(results, key=lambda x: x["net"])
        print("\n  MOST SHORT (contrarian bullish):")
        for r in sorted_by_net[:3]:
            print(f"    {r['instrument']}: {r['long_pct']:.0f}% long / {r['short_pct']:.0f}% short (net {r['net']:+.0f})")
        print("  MOST LONG (contrarian bearish):")
        for r in sorted_by_net[-3:]:
            print(f"    {r['instrument']}: {r['long_pct']:.0f}% long / {r['short_pct']:.0f}% short (net {r['net']:+.0f})")
    else:
        print("  No data collected (Myfxbook may require browser automation)")

    if args.json:
        print(json.dumps(results, indent=2))

    conn.close()


if __name__ == "__main__":
    main()
