#!/usr/bin/env python3
"""
Fundamental research engine — pulls all data sources together
and generates structured research reports.

Usage:
    python3 research.py EURUSD                    # Full instrument research
    python3 research.py XAUUSD --brief            # Quick summary
    python3 research.py --theme "rate divergence"  # Thematic research
    python3 research.py --daily-brief              # Daily market brief with trade ideas
"""
import argparse, sys, os, json, sqlite3
from datetime import datetime, timezone

# Paths to sibling skill DBs
MARKET_DB = os.path.expanduser("~/openclaw/skills/market-data-engine/data/market.db")
ECON_DB = os.path.expanduser("~/openclaw/skills/economic-data-collector/data/economic.db")
SENTIMENT_DB = os.path.expanduser("~/openclaw/skills/sentiment-engine/data/sentiment.db")
MACRO_DB = os.path.expanduser("~/openclaw/skills/macro-briefing/data/macro.db")


def safe_query(db_path, sql, params=()):
    """Query a SQLite DB, returning [] if DB doesn't exist."""
    if not os.path.exists(db_path):
        return []
    try:
        conn = sqlite3.connect(db_path)
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        return rows
    except Exception as e:
        return []


def get_price_data(instrument):
    """Get recent price data from market-data-engine."""
    rows = safe_query(MARKET_DB,
        "SELECT dt, open, high, low, close, volume FROM ohlcv WHERE instrument=? AND interval='1d' ORDER BY dt DESC LIMIT 20",
        (instrument,))
    if not rows:
        return None
    return {
        "last_close": rows[0][4],
        "last_date": rows[0][0],
        "1d_change": round((rows[0][4] / rows[1][4] - 1) * 100, 2) if len(rows) > 1 else None,
        "5d_change": round((rows[0][4] / rows[5][4] - 1) * 100, 2) if len(rows) > 5 else None,
        "20d_high": max(r[2] for r in rows),
        "20d_low": min(r[3] for r in rows),
    }


def get_currency_strength():
    """Get latest currency strength from market-data-engine."""
    rows = safe_query(MARKET_DB,
        "SELECT currency, value, date FROM currency_strength WHERE date=(SELECT MAX(date) FROM currency_strength) ORDER BY value DESC")
    return [{"currency": r[0], "value": round(r[1], 2), "date": r[2]} for r in rows]


def get_rate_differentials(pair=None):
    """Get rate differentials from economic-data-collector."""
    if pair:
        # Parse pair to find banks
        RATE_PAIRS = {
            "EURUSD": ("ECB", "Fed"), "GBPUSD": ("BOE", "Fed"), "USDJPY": ("Fed", "BOJ"),
            "AUDUSD": ("RBA", "Fed"), "NZDUSD": ("RBNZ", "Fed"), "USDCAD": ("Fed", "BOC"),
            "USDCHF": ("Fed", "SNB"),
        }
        if pair in RATE_PAIRS:
            b1, b2 = RATE_PAIRS[pair]
            rows = safe_query(ECON_DB,
                "SELECT bank, rate FROM central_bank_rates WHERE bank IN (?, ?) ORDER BY date DESC", (b1, b2))
            rates = {r[0]: r[1] for r in rows[:2]}
            if b1 in rates and b2 in rates:
                return {"base_bank": b1, "base_rate": rates[b1], "quote_bank": b2, "quote_rate": rates[b2],
                        "diff_bp": round((rates[b1] - rates[b2]) * 100)}
    # All rates
    rows = safe_query(ECON_DB,
        "SELECT bank, country, rate, date, next_meeting FROM central_bank_rates ORDER BY rate DESC")
    return [{"bank": r[0], "country": r[1], "rate": r[2], "date": r[3], "next": r[4]} for r in rows[:8]]


def get_cot_data(instrument):
    """Get COT positioning from sentiment-engine."""
    rows = safe_query(SENTIMENT_DB,
        "SELECT report_date, non_commercial_net, commercial_net, open_interest FROM cot_data WHERE instrument=? ORDER BY report_date DESC LIMIT 4",
        (instrument,))
    return [{"date": r[0], "spec_net": r[1], "commercial_net": r[2], "oi": r[3]} for r in rows]


def get_retail_sentiment(instrument):
    """Get retail sentiment from sentiment-engine."""
    rows = safe_query(SENTIMENT_DB,
        "SELECT date, long_pct, short_pct, net_sentiment FROM retail_sentiment WHERE instrument=? ORDER BY date DESC LIMIT 1",
        (instrument,))
    if rows:
        return {"long_pct": rows[0][1], "short_pct": rows[0][2], "net": rows[0][3]}
    return None


def get_fear_greed():
    """Get Fear & Greed indices."""
    results = {}
    for idx_type in ["crypto_fear_greed", "cnn_fear_greed"]:
        rows = safe_query(SENTIMENT_DB,
            "SELECT date, value, label FROM fear_greed WHERE index_type=? ORDER BY date DESC LIMIT 1",
            (idx_type,))
        if rows:
            results[idx_type] = {"value": rows[0][1], "label": rows[0][2], "date": rows[0][0]}
    return results


def get_yield_curve():
    """Get latest US yield curve."""
    rows = safe_query(ECON_DB,
        "SELECT tenor, yield_pct, change_bp FROM yield_curves WHERE country='US' AND date=(SELECT MAX(date) FROM yield_curves WHERE country='US') ORDER BY CASE tenor WHEN '3M' THEN 1 WHEN '2Y' THEN 2 WHEN '5Y' THEN 3 WHEN '10Y' THEN 4 WHEN '30Y' THEN 5 END")
    return [{"tenor": r[0], "yield": r[1], "change_bp": r[2]} for r in rows]


def build_instrument_report(instrument):
    """Build a comprehensive research report for an instrument."""
    report = {"instrument": instrument, "generated_at": datetime.now(timezone.utc).isoformat()}

    # Price
    report["price"] = get_price_data(instrument)

    # Determine asset class
    fx_pairs = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD", "USDCAD", "USDCHF",
                "EURJPY", "EURGBP", "GBPJPY", "AUDJPY", "EURAUD"]
    if instrument in fx_pairs:
        report["type"] = "forex"
        report["rate_diff"] = get_rate_differentials(instrument)
        report["cot"] = get_cot_data(instrument)
        report["retail"] = get_retail_sentiment(instrument)
        report["currency_strength"] = get_currency_strength()
    elif instrument in ["XAUUSD", "XAGUSD"]:
        report["type"] = "metal"
        report["cot"] = get_cot_data(instrument)
        report["yield_curve"] = get_yield_curve()
        report["fear_greed"] = get_fear_greed()
    elif instrument in ["BTCUSD", "ETHUSD"]:
        report["type"] = "crypto"
        report["fear_greed"] = get_fear_greed()
    elif instrument in ["BRENT", "WTI", "NATGAS"]:
        report["type"] = "energy"
        report["cot"] = get_cot_data(instrument)
    else:
        report["type"] = "index"
        report["fear_greed"] = get_fear_greed()

    # Rates always useful
    report["rates"] = get_rate_differentials()
    report["yields"] = get_yield_curve()

    return report


def build_daily_brief():
    """Build daily market brief combining all data sources."""
    brief = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "currency_strength": get_currency_strength(),
        "rates": get_rate_differentials(),
        "yields": get_yield_curve(),
        "fear_greed": get_fear_greed(),
    }

    # Key instruments snapshot
    key_instruments = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BRENT", "SPX500", "BTCUSD", "DAX"]
    brief["instruments"] = {}
    for inst in key_instruments:
        price = get_price_data(inst)
        if price:
            brief["instruments"][inst] = price

    # COT highlights
    cot_data = {}
    for inst in ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BRENT"]:
        cot = get_cot_data(inst)
        if cot:
            cot_data[inst] = cot[0]
    brief["cot_highlights"] = cot_data

    return brief


def main():
    parser = argparse.ArgumentParser(description="Fundamental research engine")
    parser.add_argument("instrument", nargs="?")
    parser.add_argument("--brief", action="store_true", help="Quick summary")
    parser.add_argument("--daily-brief", action="store_true", help="Full daily brief")
    parser.add_argument("--theme", help="Thematic research")
    args = parser.parse_args()

    if args.daily_brief:
        data = build_daily_brief()
    elif args.instrument:
        data = build_instrument_report(args.instrument.upper())
    elif args.theme:
        data = {"theme": args.theme, "note": "Use with LLM for thematic analysis"}
    else:
        parser.print_help()
        return

    print(json.dumps(data, indent=2, default=str))


if __name__ == "__main__":
    main()
