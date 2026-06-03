#!/usr/bin/env python3
"""
Market Structure Analysis — swing points, BOS/CHoCH, S/R zones,
order blocks, fair value gaps, and regime classification.

Usage:
    from structure import (
        detect_swing_points, detect_bos_choch, find_sr_zones,
        detect_order_blocks, detect_fvg, classify_regime,
        compute_full_structure
    )
    
    # Or standalone:
    python3 structure.py EURUSD
    python3 structure.py XAUUSD --regime
    python3 structure.py --scan-regimes
"""
import pandas as pd
import numpy as np
import json, sys, os, sqlite3, argparse
from collections import defaultdict

MARKET_DB = os.path.expanduser("~/openclaw/skills/market-data-engine/data/market.db")


# ─── Swing Point Detection ───────────────────────────────────────────────────

def detect_swing_points(df, left=5, right=2):
    """
    Detect swing highs and lows using left/right bar confirmation.
    left=5, right=2 means: bar must be highest/lowest of 5 bars before AND 2 bars after.
    This gives faster detection than symmetric pivots while filtering noise.
    
    Returns df with columns: swing_high, swing_low, swing_type ('HH','HL','LH','LL')
    """
    df = df.copy()
    highs = df["high"].values
    lows = df["low"].values
    n = len(df)
    
    sh = np.full(n, np.nan)
    sl = np.full(n, np.nan)
    
    for i in range(left, n - right):
        # Swing high: highest of left bars AND right bars
        if highs[i] == max(highs[i-left:i+right+1]):
            sh[i] = highs[i]
        # Swing low: lowest of left bars AND right bars
        if lows[i] == min(lows[i-left:i+right+1]):
            sl[i] = lows[i]
    
    df["swing_high"] = sh
    df["swing_low"] = sl
    
    # Classify: HH/LH for highs, HL/LL for lows
    swing_type = [""] * n
    
    prev_sh = None
    for i in range(n):
        if not np.isnan(sh[i]):
            if prev_sh is not None:
                swing_type[i] = "HH" if sh[i] > prev_sh else "LH"
            prev_sh = sh[i]
    
    prev_sl = None
    for i in range(n):
        if not np.isnan(sl[i]):
            if prev_sl is not None:
                st = "HL" if sl[i] > prev_sl else "LL"
                swing_type[i] = st if not swing_type[i] else swing_type[i] + "/" + st
            prev_sl = sl[i]
    
    df["swing_type"] = swing_type
    return df


# ─── Break of Structure / Change of Character ────────────────────────────────

def detect_bos_choch(df):
    """
    Detect Break of Structure (BOS) and Change of Character (CHoCH).
    
    BOS: Price breaks a swing point IN the direction of the trend.
      - Uptrend: close breaks above prior swing high → bullish BOS
      - Downtrend: close breaks below prior swing low → bearish BOS
    
    CHoCH: Price breaks a swing point AGAINST the trend (first reversal signal).
      - Uptrend: close breaks below prior swing low → bearish CHoCH
      - Downtrend: close breaks above prior swing high → bullish CHoCH
    
    Returns df with columns: bos (1/-1/0), choch (1/-1/0), structure_trend ('bullish'/'bearish'/'undefined')
    """
    df = df.copy()
    n = len(df)
    
    bos = np.zeros(n, dtype=int)
    choch = np.zeros(n, dtype=int)
    structure_trend = ["undefined"] * n
    
    # Collect swing points
    swing_highs = [(i, df["swing_high"].iloc[i]) for i in range(n) if not np.isnan(df["swing_high"].iloc[i])]
    swing_lows = [(i, df["swing_low"].iloc[i]) for i in range(n) if not np.isnan(df["swing_low"].iloc[i])]
    
    if len(swing_highs) < 2 or len(swing_lows) < 2:
        df["bos"] = bos
        df["choch"] = choch
        df["structure_trend"] = structure_trend
        return df
    
    # Determine initial trend from first two swing highs
    current_trend = "undefined"
    
    # Track the "valid" swing levels that define structure
    last_valid_sh = None  # Last swing high that matters for structure
    last_valid_sl = None  # Last swing low that matters for structure
    
    sh_idx = 0
    sl_idx = 0
    
    for i in range(n):
        close = df["close"].iloc[i]
        
        # Update last known swing points (only those before current bar)
        while sh_idx < len(swing_highs) and swing_highs[sh_idx][0] < i:
            last_valid_sh = swing_highs[sh_idx][1]
            sh_idx += 1
        while sl_idx < len(swing_lows) and swing_lows[sl_idx][0] < i:
            last_valid_sl = swing_lows[sl_idx][1]
            sl_idx += 1
        
        if last_valid_sh is None or last_valid_sl is None:
            structure_trend[i] = current_trend
            continue
        
        # Check for breaks
        if current_trend == "bullish" or current_trend == "undefined":
            # In uptrend: break above SH = BOS, break below SL = CHoCH
            if close > last_valid_sh:
                bos[i] = 1  # Bullish BOS (continuation)
                current_trend = "bullish"
            elif close < last_valid_sl:
                choch[i] = -1  # Bearish CHoCH (reversal)
                current_trend = "bearish"
        
        if current_trend == "bearish":
            # In downtrend: break below SL = BOS, break above SH = CHoCH
            if close < last_valid_sl:
                bos[i] = -1  # Bearish BOS (continuation)
                current_trend = "bearish"
            elif close > last_valid_sh:
                choch[i] = 1  # Bullish CHoCH (reversal)
                current_trend = "bullish"
        
        structure_trend[i] = current_trend
    
    df["bos"] = bos
    df["choch"] = choch
    df["structure_trend"] = structure_trend
    return df


# ─── Support / Resistance Zones ──────────────────────────────────────────────

def find_sr_zones(df, tolerance_pct=0.3, min_touches=2):
    """
    Cluster swing highs and lows into support/resistance zones.
    
    Groups swing points within tolerance_pct of each other.
    Zones with more touches are stronger. Recent touches weighted higher.
    
    Returns list of zones: {level, type, touches, strength, first_date, last_date}
    """
    points = []
    for i in range(len(df)):
        if not np.isnan(df["swing_high"].iloc[i]):
            points.append({"level": df["swing_high"].iloc[i], "type": "resistance", "idx": i, "date": str(df.index[i])})
        if not np.isnan(df["swing_low"].iloc[i]):
            points.append({"level": df["swing_low"].iloc[i], "type": "support", "idx": i, "date": str(df.index[i])})
    
    if not points:
        return []
    
    # Sort by level
    points.sort(key=lambda x: x["level"])
    
    # Cluster nearby points
    zones = []
    used = set()
    
    for i, p in enumerate(points):
        if i in used:
            continue
        
        cluster = [p]
        used.add(i)
        
        for j in range(i + 1, len(points)):
            if j in used:
                continue
            # Within tolerance?
            if abs(points[j]["level"] - p["level"]) / p["level"] * 100 < tolerance_pct:
                cluster.append(points[j])
                used.add(j)
            elif points[j]["level"] > p["level"] * (1 + tolerance_pct / 100):
                break  # Sorted, so no more matches
        
        if len(cluster) >= min_touches:
            avg_level = np.mean([c["level"] for c in cluster])
            n_bars = len(df)
            
            # Recency-weighted strength
            recency_scores = [(c["idx"] / n_bars) for c in cluster]  # 0-1, higher = more recent
            strength = len(cluster) * (1 + np.mean(recency_scores))
            
            # Type: if most touches are swing highs → resistance, else support
            resist_count = sum(1 for c in cluster if c["type"] == "resistance")
            support_count = len(cluster) - resist_count
            zone_type = "resistance" if resist_count > support_count else "support"
            if resist_count > 0 and support_count > 0:
                zone_type = "S/R flip"  # Acts as both
            
            zones.append({
                "level": round(avg_level, 5),
                "type": zone_type,
                "touches": len(cluster),
                "strength": round(strength, 1),
                "first_date": cluster[0]["date"][:10],
                "last_date": cluster[-1]["date"][:10],
            })
    
    # Sort by strength descending
    zones.sort(key=lambda z: z["strength"], reverse=True)
    return zones


# ─── Order Blocks ─────────────────────────────────────────────────────────────

def detect_order_blocks(df, lookback=50):
    """
    Detect order blocks — the last opposite-color candle before a strong move.
    
    Bullish OB: last bearish candle before a strong bullish move (demand zone)
    Bearish OB: last bullish candle before a strong bearish move (supply zone)
    
    A "strong move" = price moves > 2× ATR from the OB candle.
    """
    if "ATRr_14" not in df.columns:
        return []
    
    obs = []
    n = len(df)
    start = max(0, n - lookback)
    
    for i in range(start, n - 3):
        atr = df["ATRr_14"].iloc[i]
        if atr is None or np.isnan(atr) or atr == 0:
            continue
        
        candle_body = df["close"].iloc[i] - df["open"].iloc[i]
        is_bearish = candle_body < 0
        is_bullish = candle_body > 0
        
        # Check if next 3 bars make a strong move
        future_high = max(df["high"].iloc[i+1:min(i+4, n)])
        future_low = min(df["low"].iloc[i+1:min(i+4, n)])
        
        move_up = future_high - df["high"].iloc[i]
        move_down = df["low"].iloc[i] - future_low
        
        if is_bearish and move_up > 2 * atr:
            # Bullish OB: bearish candle before strong up-move
            obs.append({
                "type": "bullish_ob",
                "date": str(df.index[i])[:10],
                "top": round(df["open"].iloc[i], 5),     # OB zone top = open of bearish candle
                "bottom": round(df["close"].iloc[i], 5),  # OB zone bottom = close of bearish candle
                "strength": round(move_up / atr, 1),
                "mitigated": bool(min(df["low"].iloc[i+1:n]) < df["close"].iloc[i]),
            })
        
        if is_bullish and move_down > 2 * atr:
            # Bearish OB: bullish candle before strong down-move
            obs.append({
                "type": "bearish_ob",
                "date": str(df.index[i])[:10],
                "top": round(df["close"].iloc[i], 5),
                "bottom": round(df["open"].iloc[i], 5),
                "strength": round(move_down / atr, 1),
                "mitigated": bool(max(df["high"].iloc[i+1:n]) > df["close"].iloc[i]),
            })
    
    # Only return unmitigated OBs (still valid)
    active = [ob for ob in obs if not ob["mitigated"]]
    # Sort by recency
    active.sort(key=lambda x: x["date"], reverse=True)
    return active[:10]


# ─── Fair Value Gaps (FVG / Imbalance) ────────────────────────────────────────

def detect_fvg(df, min_gap_atr=0.5, lookback=50):
    """
    Detect Fair Value Gaps (FVG) — 3-candle imbalances where candle 1's high
    doesn't overlap candle 3's low (bullish) or vice versa.
    
    These are areas of inefficiency that price tends to revisit.
    """
    if "ATRr_14" not in df.columns:
        return []
    
    fvgs = []
    n = len(df)
    start = max(0, n - lookback)
    
    for i in range(start + 2, n):
        atr = df["ATRr_14"].iloc[i]
        if atr is None or np.isnan(atr) or atr == 0:
            continue
        
        c1_high = df["high"].iloc[i-2]
        c3_low = df["low"].iloc[i]
        c1_low = df["low"].iloc[i-2]
        c3_high = df["high"].iloc[i]
        
        # Bullish FVG: gap between candle 1 high and candle 3 low
        if c3_low > c1_high:
            gap = c3_low - c1_high
            if gap > min_gap_atr * atr:
                # Check if filled
                filled = False
                for j in range(i + 1, n):
                    if df["low"].iloc[j] <= c1_high:
                        filled = True
                        break
                
                fvgs.append({
                    "type": "bullish_fvg",
                    "date": str(df.index[i-1])[:10],
                    "top": round(c3_low, 5),
                    "bottom": round(c1_high, 5),
                    "gap_atr": round(gap / atr, 2),
                    "filled": filled,
                })
        
        # Bearish FVG: gap between candle 3 high and candle 1 low
        if c1_low > c3_high:
            gap = c1_low - c3_high
            if gap > min_gap_atr * atr:
                filled = False
                for j in range(i + 1, n):
                    if df["high"].iloc[j] >= c1_low:
                        filled = True
                        break
                
                fvgs.append({
                    "type": "bearish_fvg",
                    "date": str(df.index[i-1])[:10],
                    "top": round(c1_low, 5),
                    "bottom": round(c3_high, 5),
                    "gap_atr": round(gap / atr, 2),
                    "filled": filled,
                })
    
    # Return unfilled FVGs only
    active = [f for f in fvgs if not f["filled"]]
    active.sort(key=lambda x: x["date"], reverse=True)
    return active[:10]


# ─── Market Regime Classification ─────────────────────────────────────────────

def classify_regime(df, lookback=50):
    """
    Classify current market regime:
    
    - TRENDING_UP: HH + HL pattern, price above EMAs
    - TRENDING_DOWN: LH + LL pattern, price below EMAs
    - RANGING: No clear HH/HL or LH/LL, price oscillating around EMAs
    - BREAKOUT: Price breaking out of range (squeeze release, volume spike)
    - MEAN_REVERTING: Extended from mean, likely to revert (RSI extreme + far from EMA)
    
    Returns: {regime, confidence, details}
    """
    n = len(df)
    start = max(0, n - lookback)
    recent = df.iloc[start:]
    last = df.iloc[-1]
    
    # Count swing types in recent history
    types = recent["swing_type"].value_counts() if "swing_type" in recent.columns else pd.Series()
    hh_count = sum(1 for t in recent.get("swing_type", []) if "HH" in str(t))
    hl_count = sum(1 for t in recent.get("swing_type", []) if "HL" in str(t))
    lh_count = sum(1 for t in recent.get("swing_type", []) if "LH" in str(t))
    ll_count = sum(1 for t in recent.get("swing_type", []) if "LL" in str(t))
    
    # EMA positioning
    ema9 = last.get("EMA_9")
    ema21 = last.get("EMA_21") 
    ema50 = last.get("EMA_50")
    sma200 = last.get("SMA_200")
    close = last["close"]
    rsi = last.get("RSI_14", 50)
    natr = last.get("NATR_14", 1.0)
    
    # Squeeze status
    squeeze = last.get("squeeze", False)
    
    # BOS/CHoCH recent
    recent_bos = sum(abs(recent.get("bos", pd.Series([0]*len(recent))).values[-10:]))
    recent_choch = sum(abs(recent.get("choch", pd.Series([0]*len(recent))).values[-10:]))
    structure_trend = last.get("structure_trend", "undefined")
    
    # Distance from EMA21
    if ema21 and ema21 > 0:
        dist_from_ema21 = (close - ema21) / ema21 * 100
    else:
        dist_from_ema21 = 0
    
    # ─── Classification Logic ───
    
    # Mean reverting: RSI extreme + extended from EMA
    if (rsi > 75 and dist_from_ema21 > natr) or (rsi < 25 and dist_from_ema21 < -natr):
        return {
            "regime": "MEAN_REVERTING",
            "confidence": min(0.9, abs(rsi - 50) / 50 + abs(dist_from_ema21) / (natr * 2)),
            "direction": "overbought" if rsi > 75 else "oversold",
            "rsi": round(rsi, 1),
            "dist_from_ema21_pct": round(dist_from_ema21, 2),
            "details": f"RSI {rsi:.0f}, {abs(dist_from_ema21):.1f}% from EMA21"
        }
    
    # Breakout: squeeze releasing or strong BOS
    if squeeze:
        return {
            "regime": "BREAKOUT_PENDING",
            "confidence": 0.7,
            "direction": "unknown",
            "details": "BB/KC squeeze active — breakout imminent"
        }
    
    # Trending
    bullish_points = hh_count + hl_count
    bearish_points = lh_count + ll_count
    
    ema_aligned_bull = (ema9 and ema21 and ema50 and close > ema9 > ema21 > ema50)
    ema_aligned_bear = (ema9 and ema21 and ema50 and close < ema9 < ema21 < ema50)
    
    if bullish_points >= 3 and ema_aligned_bull and structure_trend == "bullish":
        confidence = min(0.95, 0.5 + bullish_points * 0.1 + (0.2 if sma200 and close > sma200 else 0))
        return {
            "regime": "TRENDING_UP",
            "confidence": round(confidence, 2),
            "direction": "bullish",
            "hh_hl_count": bullish_points,
            "structure_trend": structure_trend,
            "details": f"{hh_count}HH + {hl_count}HL, EMAs aligned, structure bullish"
        }
    
    if bearish_points >= 3 and ema_aligned_bear and structure_trend == "bearish":
        confidence = min(0.95, 0.5 + bearish_points * 0.1 + (0.2 if sma200 and close < sma200 else 0))
        return {
            "regime": "TRENDING_DOWN",
            "confidence": round(confidence, 2),
            "direction": "bearish",
            "lh_ll_count": bearish_points,
            "structure_trend": structure_trend,
            "details": f"{lh_count}LH + {ll_count}LL, EMAs aligned, structure bearish"
        }
    
    # Weak trend (some structure but not fully aligned)
    if bullish_points > bearish_points + 1:
        return {
            "regime": "TRENDING_UP",
            "confidence": round(0.3 + bullish_points * 0.08, 2),
            "direction": "bullish",
            "details": f"Weak uptrend: {hh_count}HH + {hl_count}HL but EMAs not fully aligned"
        }
    if bearish_points > bullish_points + 1:
        return {
            "regime": "TRENDING_DOWN",
            "confidence": round(0.3 + bearish_points * 0.08, 2),
            "direction": "bearish",
            "details": f"Weak downtrend: {lh_count}LH + {ll_count}LL but EMAs not fully aligned"
        }
    
    # Recent CHoCH = potential regime change
    if recent_choch > 0:
        return {
            "regime": "TRANSITIONING",
            "confidence": 0.5,
            "direction": "uncertain",
            "details": f"Recent CHoCH detected — possible regime change from {structure_trend}"
        }
    
    # Default: ranging
    return {
        "regime": "RANGING",
        "confidence": 0.5,
        "direction": "neutral",
        "details": f"No clear trend structure ({hh_count}HH, {hl_count}HL, {lh_count}LH, {ll_count}LL)"
    }


# ─── Key Level Proximity ─────────────────────────────────────────────────────

def key_level_proximity(df, zones, current_price=None):
    """
    Find which key levels price is near and their significance.
    Also checks round numbers and previous day H/L/C.
    """
    if current_price is None:
        current_price = df["close"].iloc[-1]
    
    atr = df["ATRr_14"].iloc[-1] if "ATRr_14" in df.columns else abs(df["close"].iloc[-1] * 0.01)
    
    nearby = []
    
    # S/R zones
    for zone in zones:
        dist = abs(current_price - zone["level"])
        if dist < 1.5 * atr:
            pct_dist = dist / current_price * 100
            nearby.append({
                "level": zone["level"],
                "type": zone["type"],
                "distance_pct": round(pct_dist, 3),
                "distance_atr": round(dist / atr, 2),
                "touches": zone["touches"],
                "strength": zone["strength"],
                "source": "sr_zone",
            })
    
    # Previous day H/L/C
    if len(df) >= 2:
        prev = df.iloc[-2]
        for label, val in [("prev_high", prev["high"]), ("prev_low", prev["low"]), ("prev_close", prev["close"])]:
            dist = abs(current_price - val)
            if dist < 1.5 * atr:
                nearby.append({
                    "level": round(val, 5),
                    "type": label,
                    "distance_pct": round(dist / current_price * 100, 3),
                    "distance_atr": round(dist / atr, 2),
                    "source": "prev_day",
                })
    
    # Round numbers (for forex: xx.x000, for indices: xxx00, for gold: xx50/xx00)
    if current_price > 100:
        # Indices/Gold: round to 100s
        round_level = round(current_price / 100) * 100
        for rl in [round_level - 100, round_level, round_level + 100]:
            dist = abs(current_price - rl)
            if dist < 1.5 * atr:
                nearby.append({
                    "level": rl,
                    "type": "round_number",
                    "distance_pct": round(dist / current_price * 100, 3),
                    "distance_atr": round(dist / atr, 2),
                    "source": "round_number",
                })
    elif current_price < 10:
        # Forex: round to 0.01 (100 pip levels)
        round_level = round(current_price, 2)
        for rl in [round_level - 0.01, round_level, round_level + 0.01]:
            dist = abs(current_price - rl)
            if dist < 0.5 * atr:
                nearby.append({
                    "level": round(rl, 4),
                    "type": "round_number",
                    "distance_pct": round(dist / current_price * 100, 3),
                    "distance_atr": round(dist / atr, 2),
                    "source": "round_number",
                })
    
    nearby.sort(key=lambda x: x["distance_atr"])
    return nearby[:10]


# ─── Full Structure Analysis ─────────────────────────────────────────────────

def compute_full_structure(df):
    """
    Run all structural analysis on a DataFrame with indicators already computed.
    Returns dict with all structure components.
    """
    # Need indicators first
    if "ATRr_14" not in df.columns:
        try:
            from indicators import compute_swing_indicators
            df = compute_swing_indicators(df)
        except ImportError:
            pass
    
    # 1. Swing points
    df = detect_swing_points(df, left=5, right=2)
    
    # 2. BOS / CHoCH
    df = detect_bos_choch(df)
    
    # 3. S/R zones
    zones = find_sr_zones(df, tolerance_pct=0.3, min_touches=2)
    
    # 4. Order blocks
    obs = detect_order_blocks(df, lookback=50)
    
    # 5. Fair value gaps
    fvgs = detect_fvg(df, lookback=50)
    
    # 6. Regime
    regime = classify_regime(df, lookback=50)
    
    # 7. Key level proximity
    nearby_levels = key_level_proximity(df, zones)
    
    # Summary
    last = df.iloc[-1]
    
    # Recent BOS/CHoCH events
    recent_events = []
    for i in range(max(0, len(df)-20), len(df)):
        if df["bos"].iloc[i] != 0:
            recent_events.append({
                "type": "BOS",
                "direction": "bullish" if df["bos"].iloc[i] > 0 else "bearish",
                "date": str(df.index[i])[:10],
            })
        if df["choch"].iloc[i] != 0:
            recent_events.append({
                "type": "CHoCH",
                "direction": "bullish" if df["choch"].iloc[i] > 0 else "bearish",
                "date": str(df.index[i])[:10],
            })
    
    return {
        "regime": regime,
        "structure_trend": last.get("structure_trend", "undefined"),
        "sr_zones": zones[:8],
        "order_blocks": obs[:5],
        "fair_value_gaps": fvgs[:5],
        "nearby_levels": nearby_levels,
        "recent_events": recent_events[-5:],
        "swing_stats": {
            "total_swing_highs": int(df["swing_high"].notna().sum()),
            "total_swing_lows": int(df["swing_low"].notna().sum()),
        },
        "dataframe": df,  # Return enriched df
    }


# ─── CLI ──────────────────────────────────────────────────────────────────────

def load_ohlcv(instrument, interval="1d", limit=300):
    if not os.path.exists(MARKET_DB):
        return None
    conn = sqlite3.connect(MARKET_DB)
    df = pd.read_sql_query(
        "SELECT dt as date, open, high, low, close, volume FROM ohlcv WHERE instrument=? AND interval=? ORDER BY dt DESC LIMIT ?",
        conn, params=(instrument, interval, limit))
    conn.close()
    if df.empty or len(df) < 30:
        return None
    df = df.iloc[::-1].reset_index(drop=True)
    df["date"] = pd.to_datetime(df["date"])
    df = df.set_index("date")
    for c in ["open", "high", "low", "close", "volume"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def main():
    parser = argparse.ArgumentParser(description="Market structure analysis")
    parser.add_argument("instrument", nargs="?")
    parser.add_argument("--regime", action="store_true", help="Regime classification only")
    parser.add_argument("--scan-regimes", action="store_true", help="Scan all instruments for regime")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--tf", default="1d", choices=["1h", "4h", "1d"])
    args = parser.parse_args()
    
    if args.scan_regimes:
        conn = sqlite3.connect(MARKET_DB)
        instruments = [r[0] for r in conn.execute(
            "SELECT DISTINCT instrument FROM ohlcv WHERE interval='1d' GROUP BY instrument HAVING COUNT(*)>50"
        ).fetchall()]
        conn.close()
        
        regimes = defaultdict(list)
        for inst in instruments:
            df = load_ohlcv(inst)
            if df is None:
                continue
            try:
                from indicators import compute_swing_indicators
                df = compute_swing_indicators(df)
                df = detect_swing_points(df)
                df = detect_bos_choch(df)
                regime = classify_regime(df)
                regimes[regime["regime"]].append({
                    "instrument": inst,
                    "confidence": regime["confidence"],
                    "details": regime.get("details", ""),
                })
            except Exception:
                continue
        
        print("📊 Market Regime Scan")
        print("═" * 80)
        for regime_name in ["TRENDING_UP", "TRENDING_DOWN", "BREAKOUT_PENDING", "MEAN_REVERTING", "TRANSITIONING", "RANGING"]:
            items = regimes.get(regime_name, [])
            if not items:
                continue
            icon = {"TRENDING_UP": "📈", "TRENDING_DOWN": "📉", "BREAKOUT_PENDING": "⚡", 
                    "MEAN_REVERTING": "🔄", "TRANSITIONING": "🔀", "RANGING": "➡️"}.get(regime_name, "❓")
            print(f"\n{icon} {regime_name} ({len(items)}):")
            items.sort(key=lambda x: x["confidence"], reverse=True)
            for item in items[:10]:
                print(f"  {item['instrument']:12s} | conf {item['confidence']:.0%} | {item['details']}")
        
        print(f"\n{'═'*80}")
        print(f"Total: {sum(len(v) for v in regimes.values())} instruments classified")
        return
    
    if not args.instrument:
        parser.print_help()
        return
    
    df = load_ohlcv(args.instrument.upper(), args.tf)
    if df is None:
        print(f"No data for {args.instrument}")
        return
    
    from indicators import compute_swing_indicators
    df = compute_swing_indicators(df)
    
    if args.regime:
        df = detect_swing_points(df)
        df = detect_bos_choch(df)
        regime = classify_regime(df)
        print(json.dumps(regime, indent=2))
        return
    
    result = compute_full_structure(df)
    # Remove dataframe from output
    output = {k: v for k, v in result.items() if k != "dataframe"}
    
    if args.json:
        print(json.dumps(output, indent=2, default=str))
    else:
        r = result["regime"]
        icon = {"TRENDING_UP": "📈", "TRENDING_DOWN": "📉", "BREAKOUT_PENDING": "⚡",
                "MEAN_REVERTING": "🔄", "TRANSITIONING": "🔀", "RANGING": "➡️"}.get(r["regime"], "❓")
        
        print(f"\n{icon} {args.instrument.upper()} — {r['regime']} (confidence: {r['confidence']:.0%})")
        print(f"   {r['details']}")
        print(f"   Structure trend: {result['structure_trend']}")
        
        # S/R Zones
        zones = result["sr_zones"]
        if zones:
            print(f"\n   📐 Key S/R Zones:")
            close = df["close"].iloc[-1]
            for z in zones[:5]:
                above_below = "▲" if z["level"] > close else "▼"
                dist = abs(z["level"] - close) / close * 100
                print(f"      {above_below} {z['level']:<12} | {z['type']:10s} | {z['touches']} touches | strength {z['strength']:.1f} | {dist:.2f}% away")
        
        # Order blocks
        obs_list = result["order_blocks"]
        if obs_list:
            print(f"\n   🧱 Active Order Blocks:")
            for ob in obs_list[:3]:
                icon_ob = "🟢" if "bullish" in ob["type"] else "🔴"
                print(f"      {icon_ob} {ob['type']:12s} | {ob['bottom']}-{ob['top']} | str {ob['strength']}× ATR | {ob['date']}")
        
        # FVGs
        fvgs = result["fair_value_gaps"]
        if fvgs:
            print(f"\n   📊 Unfilled FVGs:")
            for fvg in fvgs[:3]:
                icon_f = "🟢" if "bullish" in fvg["type"] else "🔴"
                print(f"      {icon_f} {fvg['type']:12s} | {fvg['bottom']}-{fvg['top']} | {fvg['gap_atr']}× ATR | {fvg['date']}")
        
        # Nearby levels
        nearby = result["nearby_levels"]
        if nearby:
            print(f"\n   🎯 Nearby Key Levels:")
            for nl in nearby[:5]:
                print(f"      → {nl['level']:<12} | {nl['type']:15s} | {nl['distance_atr']:.1f}× ATR away")
        
        # Recent events
        events = result["recent_events"]
        if events:
            print(f"\n   ⚡ Recent Structure Events:")
            for ev in events:
                icon_e = "🔺" if ev["direction"] == "bullish" else "🔻"
                print(f"      {icon_e} {ev['type']} {ev['direction']} — {ev['date']}")


if __name__ == "__main__":
    main()
