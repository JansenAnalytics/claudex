#!/usr/bin/env python3
"""
Collect economic calendar from the macro-briefing skill's ForexFactory integration.
Stores upcoming and recent events in SQLite.

Usage:
    python3 collect-calendar.py              # Collect this week's events
    python3 collect-calendar.py --json       # Output as JSON
"""
import argparse
import sys
import os
import json
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db, get_conn

# Reuse the macro-briefing's ForexFactory scraper
MACRO_SKILL = os.path.expanduser("~/openclaw/skills/macro-briefing")


def collect_from_macro_briefing(db_path=None):
    """Use macro-briefing's collect.py to get calendar data."""
    # Import macro-briefing's collect module
    sys.path.insert(0, os.path.join(MACRO_SKILL, "scripts"))
    try:
        from collect import fetch_calendar_events
        events = fetch_calendar_events()
        return events
    except ImportError:
        print("macro-briefing skill not found, trying direct scrape", file=sys.stderr)
        return scrape_forexfactory()


def scrape_forexfactory():
    """Direct ForexFactory scrape as fallback."""
    try:
        import cloudscraper
        scraper = cloudscraper.create_scraper()
        url = "https://www.forexfactory.com/calendar?week=this"
        resp = scraper.get(url, timeout=30)
        if resp.status_code != 200:
            print(f"ForexFactory returned {resp.status_code}", file=sys.stderr)
            return []
        # Basic parsing would go here - for now return empty
        # The macro-briefing skill handles the complex scraping
        return []
    except Exception as e:
        print(f"ForexFactory scrape failed: {e}", file=sys.stderr)
        return []


def store_events(conn, events):
    """Store calendar events in SQLite."""
    rows = []
    for ev in events:
        date_str = ev.get("date", "")[:10] if ev.get("date") else ""
        time_str = ev.get("date", "")[11:16] if ev.get("date") and len(ev.get("date", "")) > 11 else ""
        country = ev.get("country", "")
        indicator = ev.get("title", ev.get("indicator", ""))
        impact = ev.get("impact", "")
        actual = ev.get("actual", "")
        forecast = ev.get("forecast", "")
        previous = ev.get("previous", "")

        if date_str and indicator:
            rows.append((date_str, time_str, country, indicator, impact, actual, forecast, previous, "forexfactory"))

    if rows:
        conn.executemany("""
            INSERT OR REPLACE INTO calendar_events (date, time, country, indicator, impact, actual, forecast, previous, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, rows)
        conn.commit()

    return len(rows)


def main():
    parser = argparse.ArgumentParser(description="Collect economic calendar")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    conn = init_db(args.db)

    print("Collecting economic calendar events...")
    events = collect_from_macro_briefing(args.db)

    if events:
        n = store_events(conn, events)
        print(f"  Stored {n} calendar events")

        if args.json:
            print(json.dumps(events[:20], indent=2, default=str))

        # Summary by country
        countries = {}
        for ev in events:
            c = ev.get("country", "?")
            countries[c] = countries.get(c, 0) + 1
        for c in sorted(countries, key=countries.get, reverse=True):
            print(f"  {c}: {countries[c]} events")
    else:
        print("  No events collected (may need macro-briefing skill)")

    conn.close()


if __name__ == "__main__":
    main()
