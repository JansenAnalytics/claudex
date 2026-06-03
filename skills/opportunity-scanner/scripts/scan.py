#!/usr/bin/env python3
"""
Opportunity Scanner — runs the full research pipeline and generates
a Telegram-formatted alert for high-conviction opportunities.

Designed to run via cron or heartbeat.

Usage:
    python3 scan.py                       # Full scan, output to stdout
    python3 scan.py --telegram            # Format for Telegram delivery
    python3 scan.py --min-score 3         # Minimum conviction score
    python3 scan.py --refresh             # Refresh data first, then scan
"""
import argparse, sys, os, json, subprocess
from datetime import datetime, timezone

sys.path.insert(0, os.path.expanduser("~/openclaw/skills/research-synthesizer/scripts"))
sys.path.insert(0, os.path.expanduser("~/openclaw/skills/technical-analysis-engine/scripts"))
sys.path.insert(0, os.path.expanduser("~/openclaw/skills/fundamental-research-engine/scripts"))

SCAN_DB = os.path.join(os.path.dirname(__file__), "..", "data", "scans.db")


def init_scan_db():
    import sqlite3
    os.makedirs(os.path.dirname(SCAN_DB), exist_ok=True)
    conn = sqlite3.connect(SCAN_DB)
    conn.execute("""CREATE TABLE IF NOT EXISTS scan_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_time TEXT NOT NULL,
        instrument TEXT NOT NULL,
        direction TEXT,
        conviction TEXT,
        total_score INTEGER,
        tech_score INTEGER,
        fund_score INTEGER,
        macro_score INTEGER,
        rsi REAL,
        factors TEXT,
        alerted INTEGER DEFAULT 0
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS alerts_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sent_at TEXT NOT NULL,
        instrument TEXT,
        direction TEXT,
        score INTEGER,
        message TEXT
    )""")
    conn.commit()
    return conn


def refresh_data():
    """Refresh all data sources."""
    scripts = [
        ("market-data-engine", "collect.py", ["--interval", "1d", "--instruments", "key"]),
        ("sentiment-engine", "collect-fear-greed.py", []),
        ("sentiment-engine", "collect-retail.py", []),
    ]
    for skill, script, args in scripts:
        path = os.path.expanduser(f"~/openclaw/skills/{skill}/scripts/{script}")
        if os.path.exists(path):
            try:
                subprocess.run(["python3", path] + args, timeout=60, capture_output=True)
            except:
                pass


def run_scan(min_score=3):
    """Run full scan and return results."""
    from synthesize import scan_all
    return scan_all(min_score)


def format_telegram(results, scan_time):
    """Format results for Telegram message."""
    if not results:
        return None

    lines = [f"🎯 <b>Opportunity Scan</b> — {scan_time.strftime('%H:%M UTC %b %d')}"]
    lines.append("")

    high = [r for r in results if r["conviction"] == "high"]
    medium = [r for r in results if r["conviction"] == "medium"]

    if high:
        lines.append("🔥 <b>HIGH CONVICTION:</b>")
        for r in high[:5]:
            icon = "🟢" if r["direction"] == "long" else "🔴"
            lines.append(f"{icon} <b>{r['instrument']}</b> {r['direction'].upper()} (score {r['total_score']:+d})")
            lines.append(f"   RSI {r['rsi']:.0f} | ATR% {r['atr_pct']:.1f} | T:{r['tech_score']:+d} F:{r['fund_score']:+d}")
            top_factors = [f.split("] ", 1)[1] if "] " in f else f for f in r["factors"][:2]]
            for f in top_factors:
                lines.append(f"   • {f}")
            lines.append("")

    if medium:
        lines.append("📊 <b>MEDIUM CONVICTION:</b>")
        for r in medium[:5]:
            icon = "🟢" if r["direction"] == "long" else "🔴"
            perf_5d = r.get("performance", {}).get("5d_change", 0) or 0
            lines.append(f"{icon} {r['instrument']} {r['direction']} ({r['total_score']:+d}) | RSI {r['rsi']:.0f} | 5d {perf_5d:+.1f}%")

    lines.append(f"\n<i>{len(results)} instruments scored | {len(high)} high | {len(medium)} medium</i>")
    return "\n".join(lines)


def store_results(conn, results, scan_time):
    """Store scan results for tracking."""
    for r in results:
        conn.execute("""
            INSERT INTO scan_results (scan_time, instrument, direction, conviction, total_score,
                tech_score, fund_score, macro_score, rsi, factors)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (scan_time.isoformat(), r["instrument"], r["direction"], r["conviction"],
              r["total_score"], r["tech_score"], r["fund_score"], r["macro_score"],
              r["rsi"], json.dumps(r["factors"])))
    conn.commit()


def main():
    parser = argparse.ArgumentParser(description="Opportunity scanner")
    parser.add_argument("--min-score", type=int, default=3)
    parser.add_argument("--telegram", action="store_true", help="Telegram format")
    parser.add_argument("--refresh", action="store_true", help="Refresh data first")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    scan_time = datetime.now(timezone.utc)
    conn = init_scan_db()

    if args.refresh:
        print("Refreshing data...", file=sys.stderr)
        refresh_data()

    print("Running scan...", file=sys.stderr)
    results = run_scan(args.min_score)

    # Store
    store_results(conn, results, scan_time)

    if args.json:
        print(json.dumps(results, indent=2, default=str))
    elif args.telegram:
        msg = format_telegram(results, scan_time)
        if msg:
            print(msg)
        else:
            print("No opportunities above threshold.", file=sys.stderr)
    else:
        # Console output
        from synthesize import main as synth_main
        # Reuse synthesizer's display
        for r in results:
            icon = "🟢" if r["direction"] == "long" else "🔴" if r["direction"] == "short" else "⚪"
            print(f"{icon} {r['instrument']:12s} | {r['direction']:6s} | {r['conviction']:6s} | score={r['total_score']:+d} | RSI {r['rsi']:.0f}")

    conn.close()


if __name__ == "__main__":
    main()
