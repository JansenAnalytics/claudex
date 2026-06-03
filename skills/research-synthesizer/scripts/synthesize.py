#!/usr/bin/env python3
"""
Research Synthesizer — combines technical + fundamental + sentiment data
into actionable trade ideas with conviction scores.

Usage:
    python3 synthesize.py EURUSD                  # Full synthesis
    python3 synthesize.py --scan                  # Scan all for opportunities
    python3 synthesize.py --scan --min-score 7    # High conviction only
    python3 synthesize.py --daily                 # Daily opportunity report
"""
import argparse, sys, os, json, sqlite3
from datetime import datetime, timezone

# Add sibling skills to path
sys.path.insert(0, os.path.expanduser("~/openclaw/skills/technical-analysis-engine/scripts"))
sys.path.insert(0, os.path.expanduser("~/openclaw/skills/fundamental-research-engine/scripts"))

MARKET_DB = os.path.expanduser("~/openclaw/skills/market-data-engine/data/market.db")
ECON_DB = os.path.expanduser("~/openclaw/skills/economic-data-collector/data/economic.db")
SENTIMENT_DB = os.path.expanduser("~/openclaw/skills/sentiment-engine/data/sentiment.db")


def safe_q(db, sql, params=()):
    if not os.path.exists(db):
        return []
    try:
        c = sqlite3.connect(db)
        r = c.execute(sql, params).fetchall()
        c.close()
        return r
    except:
        return []


def get_technical_score(instrument):
    """Run technical analysis and return a scored summary."""
    try:
        from analyze import analyze_instrument
        result = analyze_instrument(instrument, "1d")
        if "error" in result:
            return None

        score = 0
        factors = []
        ind = result.get("indicators", {})
        summary = result.get("summary", {})
        perf = result.get("performance", {})
        bias = summary.get("bias", "neutral")

        # RSI
        rsi = ind.get("RSI_14", 50)
        if rsi < 30:
            score += 2
            factors.append(f"RSI oversold ({rsi:.0f})")
        elif rsi > 70:
            score -= 2
            factors.append(f"RSI overbought ({rsi:.0f})")
        elif 40 < rsi < 60:
            pass  # Neutral
        elif rsi < 40:
            score += 1
            factors.append(f"RSI weak ({rsi:.0f})")
        elif rsi > 60:
            score -= 1
            factors.append(f"RSI strong ({rsi:.0f})")

        # Trend
        if bias == "bullish":
            score += 2
            factors.append("Trend aligned bullish")
        elif bias == "bearish":
            score -= 2
            factors.append("Trend aligned bearish")

        # MACD
        macd = ind.get("MACDh_12_26_9", 0)
        if macd > 0:
            score += 1
            factors.append("MACD bullish")
        elif macd < 0:
            score -= 1
            factors.append("MACD bearish")

        # Signals
        for sig in summary.get("signals", []):
            if "bullish" in sig.lower():
                score += 1
                factors.append(sig)
            elif "bearish" in sig.lower():
                score -= 1
                factors.append(sig)
            elif "squeeze" in sig.lower():
                factors.append(sig)  # Neutral but noteworthy

        # Momentum (5d performance)
        chg_5d = perf.get("5d_change", 0)
        if chg_5d and abs(chg_5d) > 2:
            factors.append(f"5d momentum: {chg_5d:+.1f}%")

        # ── Structure scoring ──
        regime = result.get("regime", {})
        regime_name = regime.get("regime", "")
        regime_conf = regime.get("confidence", 0)
        struct_trend = result.get("structure_trend", "undefined")

        if regime_name == "TRENDING_UP" and regime_conf >= 0.7:
            score += 1
            factors.append(f"Structure: {regime_name} ({regime_conf:.0%})")
        elif regime_name == "TRENDING_DOWN" and regime_conf >= 0.7:
            score -= 1
            factors.append(f"Structure: {regime_name} ({regime_conf:.0%})")
        elif regime_name == "MEAN_REVERTING":
            direction = regime.get("direction", "")
            if direction == "oversold":
                score += 1
                factors.append(f"Structure: mean-reverting oversold")
            elif direction == "overbought":
                score -= 1
                factors.append(f"Structure: mean-reverting overbought")
        elif regime_name == "BREAKOUT_PENDING":
            factors.append("Structure: squeeze — breakout pending")

        # Recent BOS/CHoCH events
        events = result.get("recent_structure_events", [])
        recent_bos = [e for e in events if e["type"] == "BOS"]
        recent_choch = [e for e in events if e["type"] == "CHoCH"]
        if recent_choch:
            last_choch = recent_choch[-1]
            factors.append(f"CHoCH {last_choch['direction']} ({last_choch['date']})")

        # Nearby key levels
        nearby = result.get("nearby_levels", [])
        for nl in nearby[:2]:
            if nl["distance_atr"] < 0.3:
                factors.append(f"At key {nl['type']}: {nl['level']}")

        # Unfilled FVGs as targets
        fvgs = result.get("fair_value_gaps", [])
        if fvgs:
            fvg = fvgs[0]
            factors.append(f"Unfilled {fvg['type']}: {fvg['bottom']}-{fvg['top']}")

        return {
            "score": score,
            "factors": factors,
            "rsi": round(rsi, 1),
            "bias": bias,
            "atr_pct": ind.get("NATR_14", 0),
            "last_close": result.get("last_close"),
            "performance": perf,
            "regime": regime_name,
            "regime_confidence": regime_conf,
            "structure_trend": struct_trend,
        }
    except Exception as e:
        return None


def get_fundamental_score(instrument):
    """Score fundamental factors."""
    score = 0
    factors = []

    # Rate differential (for FX)
    RATE_PAIRS = {
        "EURUSD": ("ECB", "Fed"), "GBPUSD": ("BOE", "Fed"), "USDJPY": ("Fed", "BOJ"),
        "AUDUSD": ("RBA", "Fed"), "NZDUSD": ("RBNZ", "Fed"), "USDCAD": ("Fed", "BOC"),
        "USDCHF": ("Fed", "SNB"), "EURJPY": ("ECB", "BOJ"), "GBPJPY": ("BOE", "BOJ"),
    }

    if instrument in RATE_PAIRS:
        b1, b2 = RATE_PAIRS[instrument]
        rows = safe_q(ECON_DB, "SELECT bank, rate FROM central_bank_rates WHERE bank IN (?, ?)", (b1, b2))
        rates = {r[0]: r[1] for r in rows}
        if b1 in rates and b2 in rates:
            diff = rates[b1] - rates[b2]
            diff_bp = round(diff * 100)
            if abs(diff_bp) > 200:
                direction = "long" if diff > 0 else "short"
                score += 1 if diff > 0 else -1
                factors.append(f"Rate diff {diff_bp:+d}bp favors {direction}")
            elif abs(diff_bp) > 100:
                factors.append(f"Rate diff {diff_bp:+d}bp (moderate)")

    # COT positioning
    cot = safe_q(SENTIMENT_DB,
        "SELECT non_commercial_net, open_interest FROM cot_data WHERE instrument=? ORDER BY report_date DESC LIMIT 2",
        (instrument,))
    if len(cot) >= 1:
        spec_net = cot[0][0]
        oi = cot[0][1]
        if oi > 0:
            pct = (spec_net / oi) * 100
            if pct > 30:
                score -= 1  # Crowded long = contrarian bearish
                factors.append(f"COT crowded long ({pct:.0f}%)")
            elif pct < -30:
                score += 1  # Crowded short = contrarian bullish
                factors.append(f"COT crowded short ({pct:.0f}%)")
            else:
                factors.append(f"COT spec net: {spec_net:+,d}")

        # COT momentum (week-over-week change)
        if len(cot) >= 2:
            delta = cot[0][0] - cot[1][0]
            if abs(delta) > 10000:
                direction = "adding longs" if delta > 0 else "adding shorts"
                factors.append(f"COT momentum: {direction} ({delta:+,d})")

    # Retail sentiment (contrarian)
    retail = safe_q(SENTIMENT_DB,
        "SELECT long_pct, short_pct, net_sentiment FROM retail_sentiment WHERE instrument=? ORDER BY date DESC LIMIT 1",
        (instrument,))
    if retail:
        net = retail[0][2]
        if net > 30:
            score -= 1  # Retail very long = contrarian short
            factors.append(f"Retail crowded long ({retail[0][0]:.0f}% long) — contrarian bearish")
        elif net < -30:
            score += 1
            factors.append(f"Retail crowded short ({retail[0][1]:.0f}% short) — contrarian bullish")

    return {"score": score, "factors": factors}


def get_macro_score(instrument):
    """Score macro environment factors."""
    score = 0
    factors = []

    # Fear & Greed
    for idx_type in ["crypto_fear_greed", "cnn_fear_greed"]:
        rows = safe_q(SENTIMENT_DB,
            "SELECT value, label FROM fear_greed WHERE index_type=? ORDER BY date DESC LIMIT 1",
            (idx_type,))
        if rows:
            val = rows[0][0]
            label = rows[0][1]
            if val < 20:
                factors.append(f"{idx_type.replace('_', ' ').title()}: {val:.0f} ({label}) — extreme fear")
            elif val > 80:
                factors.append(f"{idx_type.replace('_', ' ').title()}: {val:.0f} ({label}) — extreme greed")

    # Yield curve inversion
    yields = safe_q(ECON_DB,
        "SELECT tenor, yield_pct FROM yield_curves WHERE country='US' AND date=(SELECT MAX(date) FROM yield_curves WHERE country='US')")
    yield_map = {r[0]: r[1] for r in yields}
    if "2Y" in yield_map and "10Y" in yield_map:
        spread = yield_map["10Y"] - yield_map["2Y"]
        if spread < 0:
            factors.append(f"Yield curve INVERTED (2s10s: {spread*100:.0f}bp)")
        elif spread < 0.25:
            factors.append(f"Yield curve flat (2s10s: {spread*100:.0f}bp)")

    return {"score": score, "factors": factors}


def synthesize(instrument):
    """Full synthesis: technical + fundamental + macro → conviction score."""
    tech = get_technical_score(instrument)
    fund = get_fundamental_score(instrument)
    macro = get_macro_score(instrument)

    if tech is None:
        return {"instrument": instrument, "error": "No technical data"}

    # Combine scores
    total_score = tech["score"] + fund["score"] + macro["score"]
    all_factors = (
        [f"[TECH] {f}" for f in tech["factors"]] +
        [f"[FUND] {f}" for f in fund["factors"]] +
        [f"[MACRO] {f}" for f in macro["factors"]]
    )

    # Conviction
    abs_score = abs(total_score)
    if abs_score >= 5:
        conviction = "high"
    elif abs_score >= 3:
        conviction = "medium"
    else:
        conviction = "low"

    direction = "long" if total_score > 0 else "short" if total_score < 0 else "neutral"

    return {
        "instrument": instrument,
        "direction": direction,
        "conviction": conviction,
        "total_score": total_score,
        "tech_score": tech["score"],
        "fund_score": fund["score"],
        "macro_score": macro["score"],
        "bias": tech["bias"],
        "rsi": tech["rsi"],
        "atr_pct": round(tech.get("atr_pct", 0), 2),
        "last_close": tech["last_close"],
        "performance": tech["performance"],
        "factors": all_factors,
    }


def scan_all(min_score=0, asset_class=None):
    """Scan all instruments and rank by conviction."""
    from screener import ASSET_CLASSES

    if asset_class:
        instruments = ASSET_CLASSES.get(asset_class, [])
    else:
        instruments = []
        for cls in ASSET_CLASSES.values():
            instruments.extend(cls)

    results = []
    for inst in instruments:
        r = synthesize(inst)
        if "error" in r:
            continue
        if abs(r["total_score"]) >= min_score:
            results.append(r)

    results.sort(key=lambda x: abs(x["total_score"]), reverse=True)
    return results


def main():
    parser = argparse.ArgumentParser(description="Research synthesizer")
    parser.add_argument("instrument", nargs="?")
    parser.add_argument("--scan", action="store_true")
    parser.add_argument("--min-score", type=int, default=2)
    parser.add_argument("--asset-class", choices=["forex", "crypto", "indices", "metals", "energy"])
    parser.add_argument("--daily", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--top", type=int, default=15)
    args = parser.parse_args()

    if args.scan or args.daily:
        results = scan_all(args.min_score, args.asset_class)

        if args.json:
            print(json.dumps(results[:args.top], indent=2, default=str))
        else:
            print(f"🎯 Research Synthesis — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC")
            print(f"{'═'*90}")

            # Group by conviction
            for conv in ["high", "medium"]:
                group = [r for r in results if r["conviction"] == conv]
                if not group:
                    continue
                print(f"\n{'🔥' if conv == 'high' else '📊'} {conv.upper()} CONVICTION:")
                for r in group[:args.top]:
                    icon = "🟢" if r["direction"] == "long" else "🔴" if r["direction"] == "short" else "⚪"
                    print(f"  {icon} {r['instrument']:12s} | {r['direction']:6s} | score={r['total_score']:+d} (T:{r['tech_score']:+d} F:{r['fund_score']:+d} M:{r['macro_score']:+d}) | RSI {r['rsi']:.0f} | ATR% {r['atr_pct']:.1f}")
                    # Top 2 factors
                    for f in r["factors"][:2]:
                        print(f"                {f}")

            # Low conviction with notable signals
            low = [r for r in results if r["conviction"] == "low" and r["factors"]]
            if low:
                print(f"\n📋 WATCHLIST ({len(low)} instruments with signals but low conviction)")

            print(f"\n{'═'*90}")
            print(f"Total: {len(results)} instruments scored | {sum(1 for r in results if r['conviction']=='high')} high | {sum(1 for r in results if r['conviction']=='medium')} medium")

    elif args.instrument:
        result = synthesize(args.instrument.upper())
        if args.json:
            print(json.dumps(result, indent=2, default=str))
        else:
            r = result
            if "error" in r:
                print(f"Error: {r['error']}")
                return
            icon = "🟢" if r["direction"] == "long" else "🔴" if r["direction"] == "short" else "⚪"
            print(f"\n{icon} {r['instrument']} — {r['direction'].upper()} | Conviction: {r['conviction'].upper()} ({r['total_score']:+d})")
            print(f"   Price: {r['last_close']} | RSI: {r['rsi']:.0f} | ATR%: {r['atr_pct']:.1f}")
            print(f"   Scores: Tech {r['tech_score']:+d} | Fund {r['fund_score']:+d} | Macro {r['macro_score']:+d}")
            print(f"\n   Factors:")
            for f in r["factors"]:
                print(f"   • {f}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
