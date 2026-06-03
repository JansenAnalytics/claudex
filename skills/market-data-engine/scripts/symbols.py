"""
Symbol mapping for all tradeable instruments across data sources.
Central registry — all other scripts import from here.
"""

# ═══════════════════════════════════════════════════════════
# ASSET UNIVERSE — the user's full instrument list
# ═══════════════════════════════════════════════════════════

INSTRUMENTS = {
    # ── Currency Strength Indices (TradingView only) ──
    "DXY":    {"class": "index", "subclass": "currency_index", "yf": "DX-Y.NYB", "tv": ("DXY", "TVC"),   "desc": "US Dollar Index"},
    "EXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("EXY", "TVC"),   "desc": "Euro Index"},
    "BXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("BXY", "TVC"),   "desc": "British Pound Index"},
    "JXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("JXY", "TVC"),   "desc": "Japanese Yen Index"},
    "CXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("CXY", "TVC"),   "desc": "Canadian Dollar Index"},
    "AXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("AXY", "TVC"),   "desc": "Australian Dollar Index"},
    "ZXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("ZXY", "TVC"),   "desc": "New Zealand Dollar Index"},
    "SXY":    {"class": "index", "subclass": "currency_index", "yf": None,        "tv": ("SXY", "TVC"),   "desc": "Swiss Franc Index"},

    # ── Crypto ──
    "BCH":    {"class": "crypto", "yf": "BCH-USD",    "tv": ("BCHUSD", "COINBASE"), "desc": "Bitcoin Cash"},
    "ETH":    {"class": "crypto", "yf": "ETH-USD",    "tv": ("ETHUSD", "COINBASE"), "desc": "Ethereum"},

    # ── Forex Majors ──
    "AUDUSD": {"class": "forex", "subclass": "major", "yf": "AUDUSD=X", "tv": ("AUDUSD", "FX_IDC"), "desc": "AUD/USD"},
    "EURUSD": {"class": "forex", "subclass": "major", "yf": "EURUSD=X", "tv": ("EURUSD", "FX_IDC"), "desc": "EUR/USD"},
    "GBPUSD": {"class": "forex", "subclass": "major", "yf": "GBPUSD=X", "tv": ("GBPUSD", "FX_IDC"), "desc": "GBP/USD"},
    "NZDUSD": {"class": "forex", "subclass": "major", "yf": "NZDUSD=X", "tv": ("NZDUSD", "FX_IDC"), "desc": "NZD/USD"},
    "USDCAD": {"class": "forex", "subclass": "major", "yf": "USDCAD=X", "tv": ("USDCAD", "FX_IDC"), "desc": "USD/CAD"},
    "USDCHF": {"class": "forex", "subclass": "major", "yf": "USDCHF=X", "tv": ("USDCHF", "FX_IDC"), "desc": "USD/CHF"},
    "USDJPY": {"class": "forex", "subclass": "major", "yf": "USDJPY=X", "tv": ("USDJPY", "FX_IDC"), "desc": "USD/JPY"},

    # ── Forex Crosses ──
    "AUDCAD": {"class": "forex", "subclass": "cross", "yf": "AUDCAD=X", "tv": ("AUDCAD", "FX_IDC"), "desc": "AUD/CAD"},
    "AUDCHF": {"class": "forex", "subclass": "cross", "yf": "AUDCHF=X", "tv": ("AUDCHF", "FX_IDC"), "desc": "AUD/CHF"},
    "AUDJPY": {"class": "forex", "subclass": "cross", "yf": "AUDJPY=X", "tv": ("AUDJPY", "FX_IDC"), "desc": "AUD/JPY"},
    "AUDNZD": {"class": "forex", "subclass": "cross", "yf": "AUDNZD=X", "tv": ("AUDNZD", "FX_IDC"), "desc": "AUD/NZD"},
    "CADCHF": {"class": "forex", "subclass": "cross", "yf": "CADCHF=X", "tv": ("CADCHF", "FX_IDC"), "desc": "CAD/CHF"},
    "CADJPY": {"class": "forex", "subclass": "cross", "yf": "CADJPY=X", "tv": ("CADJPY", "FX_IDC"), "desc": "CAD/JPY"},
    "CHFJPY": {"class": "forex", "subclass": "cross", "yf": "CHFJPY=X", "tv": ("CHFJPY", "FX_IDC"), "desc": "CHF/JPY"},
    "EURAUD": {"class": "forex", "subclass": "cross", "yf": "EURAUD=X", "tv": ("EURAUD", "FX_IDC"), "desc": "EUR/AUD"},
    "EURCAD": {"class": "forex", "subclass": "cross", "yf": "EURCAD=X", "tv": ("EURCAD", "FX_IDC"), "desc": "EUR/CAD"},
    "EURCHF": {"class": "forex", "subclass": "cross", "yf": "EURCHF=X", "tv": ("EURCHF", "FX_IDC"), "desc": "EUR/CHF"},
    "EURGBP": {"class": "forex", "subclass": "cross", "yf": "EURGBP=X", "tv": ("EURGBP", "FX_IDC"), "desc": "EUR/GBP"},
    "EURJPY": {"class": "forex", "subclass": "cross", "yf": "EURJPY=X", "tv": ("EURJPY", "FX_IDC"), "desc": "EUR/JPY"},
    "EURNZD": {"class": "forex", "subclass": "cross", "yf": "EURNZD=X", "tv": ("EURNZD", "FX_IDC"), "desc": "EUR/NZD"},
    "GBPAUD": {"class": "forex", "subclass": "cross", "yf": "GBPAUD=X", "tv": ("GBPAUD", "FX_IDC"), "desc": "GBP/AUD"},
    "GBPCAD": {"class": "forex", "subclass": "cross", "yf": "GBPCAD=X", "tv": ("GBPCAD", "FX_IDC"), "desc": "GBP/CAD"},
    "GBPCHF": {"class": "forex", "subclass": "cross", "yf": "GBPCHF=X", "tv": ("GBPCHF", "FX_IDC"), "desc": "GBP/CHF"},
    "GBPJPY": {"class": "forex", "subclass": "cross", "yf": "GBPJPY=X", "tv": ("GBPJPY", "FX_IDC"), "desc": "GBP/JPY"},
    "GBPNZD": {"class": "forex", "subclass": "cross", "yf": "GBPNZD=X", "tv": ("GBPNZD", "FX_IDC"), "desc": "GBP/NZD"},
    "NZDCAD": {"class": "forex", "subclass": "cross", "yf": "NZDCAD=X", "tv": ("NZDCAD", "FX_IDC"), "desc": "NZD/CAD"},
    "NZDCHF": {"class": "forex", "subclass": "cross", "yf": "NZDCHF=X", "tv": ("NZDCHF", "FX_IDC"), "desc": "NZD/CHF"},
    "NZDJPY": {"class": "forex", "subclass": "cross", "yf": "NZDJPY=X", "tv": ("NZDJPY", "FX_IDC"), "desc": "NZD/JPY"},

    # ── Forex Exotics ──
    "CADSGD": {"class": "forex", "subclass": "exotic", "yf": "CADSGD=X", "tv": ("CADSGD", "FX_IDC"), "desc": "CAD/SGD"},
    "EURCZK": {"class": "forex", "subclass": "exotic", "yf": "EURCZK=X", "tv": ("EURCZK", "FX_IDC"), "desc": "EUR/CZK"},
    "EURDKK": {"class": "forex", "subclass": "exotic", "yf": "EURDKK=X", "tv": ("EURDKK", "FX_IDC"), "desc": "EUR/DKK"},
    "EURHKD": {"class": "forex", "subclass": "exotic", "yf": "EURHKD=X", "tv": ("EURHKD", "FX_IDC"), "desc": "EUR/HKD"},
    "EURHUF": {"class": "forex", "subclass": "exotic", "yf": "EURHUF=X", "tv": ("EURHUF", "FX_IDC"), "desc": "EUR/HUF"},
    "EURNOK": {"class": "forex", "subclass": "exotic", "yf": "EURNOK=X", "tv": ("EURNOK", "FX_IDC"), "desc": "EUR/NOK"},
    "EURPLN": {"class": "forex", "subclass": "exotic", "yf": "EURPLN=X", "tv": ("EURPLN", "FX_IDC"), "desc": "EUR/PLN"},
    "EURSEK": {"class": "forex", "subclass": "exotic", "yf": "EURSEK=X", "tv": ("EURSEK", "FX_IDC"), "desc": "EUR/SEK"},
    "EURSGD": {"class": "forex", "subclass": "exotic", "yf": "EURSGD=X", "tv": ("EURSGD", "FX_IDC"), "desc": "EUR/SGD"},
    "EURTRY": {"class": "forex", "subclass": "exotic", "yf": "EURTRY=X", "tv": ("EURTRY", "FX_IDC"), "desc": "EUR/TRY"},
    "EURZAR": {"class": "forex", "subclass": "exotic", "yf": "EURZAR=X", "tv": ("EURZAR", "FX_IDC"), "desc": "EUR/ZAR"},
    "GBPDKK": {"class": "forex", "subclass": "exotic", "yf": "GBPDKK=X", "tv": ("GBPDKK", "FX_IDC"), "desc": "GBP/DKK"},
    "GBPNOK": {"class": "forex", "subclass": "exotic", "yf": "GBPNOK=X", "tv": ("GBPNOK", "FX_IDC"), "desc": "GBP/NOK"},
    "GBPSEK": {"class": "forex", "subclass": "exotic", "yf": "GBPSEK=X", "tv": ("GBPSEK", "FX_IDC"), "desc": "GBP/SEK"},
    "NOKSEK": {"class": "forex", "subclass": "exotic", "yf": "NOKSEK=X", "tv": ("NOKSEK", "FX_IDC"), "desc": "NOK/SEK"},
    "USDCNH": {"class": "forex", "subclass": "exotic", "yf": "USDCNH=X", "tv": ("USDCNH", "FX_IDC"), "desc": "USD/CNH"},
    "USDCZK": {"class": "forex", "subclass": "exotic", "yf": "USDCZK=X", "tv": ("USDCZK", "FX_IDC"), "desc": "USD/CZK"},
    "USDDKK": {"class": "forex", "subclass": "exotic", "yf": "USDDKK=X", "tv": ("USDDKK", "FX_IDC"), "desc": "USD/DKK"},
    "USDHKD": {"class": "forex", "subclass": "exotic", "yf": "USDHKD=X", "tv": ("USDHKD", "FX_IDC"), "desc": "USD/HKD"},
    "USDHUF": {"class": "forex", "subclass": "exotic", "yf": "USDHUF=X", "tv": ("USDHUF", "FX_IDC"), "desc": "USD/HUF"},
    "USDILS": {"class": "forex", "subclass": "exotic", "yf": "USDILS=X", "tv": ("USDILS", "FX_IDC"), "desc": "USD/ILS"},
    "USDNOK": {"class": "forex", "subclass": "exotic", "yf": "USDNOK=X", "tv": ("USDNOK", "FX_IDC"), "desc": "USD/NOK"},
    "USDPLN": {"class": "forex", "subclass": "exotic", "yf": "USDPLN=X", "tv": ("USDPLN", "FX_IDC"), "desc": "USD/PLN"},
    "USDSEK": {"class": "forex", "subclass": "exotic", "yf": "USDSEK=X", "tv": ("USDSEK", "FX_IDC"), "desc": "USD/SEK"},
    "USDSGD": {"class": "forex", "subclass": "exotic", "yf": "USDSGD=X", "tv": ("USDSGD", "FX_IDC"), "desc": "USD/SGD"},
    "USDTRY": {"class": "forex", "subclass": "exotic", "yf": "USDTRY=X", "tv": ("USDTRY", "FX_IDC"), "desc": "USD/TRY"},
    "USDZAR": {"class": "forex", "subclass": "exotic", "yf": "USDZAR=X", "tv": ("USDZAR", "FX_IDC"), "desc": "USD/ZAR"},

    # ── Indices ──
    "DAX":     {"class": "index", "subclass": "equity", "yf": "^GDAXI",  "tv": ("DEU40", "PEPPERSTONE"), "desc": "Germany 40"},
    "ESP35":   {"class": "index", "subclass": "equity", "yf": "^IBEX",   "tv": ("ESP35", "PEPPERSTONE"),  "desc": "Spain 35"},
    "EUSTX50": {"class": "index", "subclass": "equity", "yf": "^STOXX50E","tv": ("EU50",  "PEPPERSTONE"), "desc": "Euro Stoxx 50"},
    "FRA40":   {"class": "index", "subclass": "equity", "yf": "^FCHI",   "tv": ("FRA40", "PEPPERSTONE"),  "desc": "France 40"},
    "JPN225":  {"class": "index", "subclass": "equity", "yf": "^N225",   "tv": ("JPN225","PEPPERSTONE"),  "desc": "Nikkei 225"},
    "NAS100":  {"class": "index", "subclass": "equity", "yf": "^NDX",    "tv": ("NAS100","PEPPERSTONE"),  "desc": "Nasdaq 100"},
    "SPX500":  {"class": "index", "subclass": "equity", "yf": "^GSPC",   "tv": ("SPX500","PEPPERSTONE"),  "desc": "S&P 500"},
    "UK100":   {"class": "index", "subclass": "equity", "yf": "^FTSE",   "tv": ("UK100", "PEPPERSTONE"),  "desc": "FTSE 100"},
    "US30":    {"class": "index", "subclass": "equity", "yf": "^DJI",    "tv": ("US30",  "PEPPERSTONE"),  "desc": "Dow Jones 30"},

    # ── Metals ──
    "XAUUSD":  {"class": "commodity", "subclass": "metal", "yf": "GC=F",  "tv": ("XAUUSD", "PEPPERSTONE"), "desc": "Gold"},
    "XAGUSD":  {"class": "commodity", "subclass": "metal", "yf": "SI=F",  "tv": ("XAGUSD", "PEPPERSTONE"), "desc": "Silver"},

    # ── Energy (reference, not traded but needed for analysis) ──
    "BRENT":   {"class": "commodity", "subclass": "energy", "yf": "BZ=F", "tv": ("UKOIL", "TVC"),         "desc": "Brent Crude"},
    "WTI":     {"class": "commodity", "subclass": "energy", "yf": "CL=F", "tv": ("USOIL", "TVC"),         "desc": "WTI Crude"},
    "NATGAS":  {"class": "commodity", "subclass": "energy", "yf": "NG=F", "tv": ("NATGAS","TVC"),          "desc": "Natural Gas"},
}

# ── Convenience lookups ──
def get_by_class(asset_class):
    return {k: v for k, v in INSTRUMENTS.items() if v["class"] == asset_class}

def get_by_subclass(subclass):
    return {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == subclass}

def get_yf_symbol(instrument):
    return INSTRUMENTS.get(instrument, {}).get("yf")

def get_tv_symbol(instrument):
    return INSTRUMENTS.get(instrument, {}).get("tv")

CURRENCY_INDICES = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "currency_index"}
FOREX_MAJORS = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "major"}
FOREX_CROSSES = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "cross"}
FOREX_EXOTICS = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "exotic"}
EQUITY_INDICES = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "equity"}
METALS = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "metal"}
ENERGY = {k: v for k, v in INSTRUMENTS.items() if v.get("subclass") == "energy"}
CRYPTO = {k: v for k, v in INSTRUMENTS.items() if v["class"] == "crypto"}

# Interval mapping
INTERVALS = {
    "1m": {"yf": "1m",  "tv_attr": "in_1_minute"},
    "5m": {"yf": "5m",  "tv_attr": "in_5_minute"},
    "15m":{"yf": "15m", "tv_attr": "in_15_minute"},
    "30m":{"yf": "30m", "tv_attr": "in_30_minute"},
    "1h": {"yf": "1h",  "tv_attr": "in_1_hour"},
    "4h": {"yf": None,  "tv_attr": "in_4_hour"},  # yfinance doesn't have 4h
    "1d": {"yf": "1d",  "tv_attr": "in_daily"},
    "1w": {"yf": "1wk", "tv_attr": "in_weekly"},
    "1M": {"yf": "1mo", "tv_attr": "in_monthly"},
}

if __name__ == "__main__":
    print(f"Total instruments: {len(INSTRUMENTS)}")
    print(f"  Currency indices: {len(CURRENCY_INDICES)}")
    print(f"  Forex majors: {len(FOREX_MAJORS)}")
    print(f"  Forex crosses: {len(FOREX_CROSSES)}")
    print(f"  Forex exotics: {len(FOREX_EXOTICS)}")
    print(f"  Equity indices: {len(EQUITY_INDICES)}")
    print(f"  Metals: {len(METALS)}")
    print(f"  Energy: {len(ENERGY)}")
    print(f"  Crypto: {len(CRYPTO)}")
