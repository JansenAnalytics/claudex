#!/usr/bin/env python3
"""
Collect Fear & Greed indices.
- CNN Fear & Greed (equities)
- Crypto Fear & Greed

Usage:
    python3 collect-fear-greed.py
"""
import argparse, sys, os, json
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))
from db import init_db

def fetch_crypto_fear_greed():
    """Fetch Crypto Fear & Greed Index from alternative.me API."""
    import requests
    try:
        resp = requests.get("https://api.alternative.me/fng/?limit=30", timeout=10)
        if resp.status_code != 200:
            return []
        data = resp.json().get("data", [])
        results = []
        for d in data:
            results.append({
                "date": datetime.fromtimestamp(int(d["timestamp"]), tz=timezone.utc).strftime("%Y-%m-%d"),
                "index_type": "crypto_fear_greed",
                "value": float(d["value"]),
                "label": d.get("value_classification", ""),
                "source": "alternative.me",
            })
        return results
    except Exception as e:
        print(f"Crypto F&G failed: {e}", file=sys.stderr)
        return []


def fetch_cnn_fear_greed():
    """Fetch CNN Fear & Greed Index."""
    import requests
    try:
        # CNN's internal API
        url = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return []
        data = resp.json()

        results = []
        # Current score
        score = data.get("fear_and_greed", {}).get("score")
        rating = data.get("fear_and_greed", {}).get("rating")
        if score is not None:
            results.append({
                "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                "index_type": "cnn_fear_greed",
                "value": float(score),
                "label": rating or "",
                "source": "cnn",
            })

        # Historical
        for ts_data in data.get("fear_and_greed_historical", {}).get("data", [])[-30:]:
            if isinstance(ts_data, (list, tuple)) and len(ts_data) >= 2:
                ts_ms = ts_data[0]
                val = ts_data[1]
                date_str = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
                results.append({
                    "date": date_str,
                    "index_type": "cnn_fear_greed",
                    "value": float(val),
                    "label": "",
                    "source": "cnn",
                })

        return results
    except Exception as e:
        print(f"CNN F&G failed: {e}", file=sys.stderr)
        return []


def main():
    parser = argparse.ArgumentParser(description="Collect Fear & Greed indices")
    parser.add_argument("--db", help="Database path")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    conn = init_db(args.db)
    all_results = []

    print("Collecting Fear & Greed indices...")

    crypto = fetch_crypto_fear_greed()
    if crypto:
        all_results.extend(crypto)
        latest = crypto[0]
        print(f"  Crypto F&G: {latest['value']:.0f} ({latest['label']}) — {len(crypto)} days")

    cnn = fetch_cnn_fear_greed()
    if cnn:
        all_results.extend(cnn)
        latest = [c for c in cnn if c["index_type"] == "cnn_fear_greed"]
        if latest:
            print(f"  CNN F&G: {latest[0]['value']:.0f} ({latest[0]['label']}) — {len(cnn)} days")

    if all_results:
        rows = [(r["date"], r["index_type"], r["value"], r["label"], r["source"]) for r in all_results]
        conn.executemany("""
            INSERT OR REPLACE INTO fear_greed (date, index_type, value, label, source)
            VALUES (?, ?, ?, ?, ?)
        """, rows)
        conn.commit()
        print(f"  Total: {len(all_results)} records stored")

    if args.json:
        print(json.dumps(all_results[:5], indent=2))

    conn.close()


if __name__ == "__main__":
    main()
