"""
SQLite database schema and helpers for market data storage.
"""
import sqlite3
import os

DEFAULT_DB = os.path.join(os.path.dirname(__file__), "..", "data", "market.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS ohlcv (
    instrument TEXT NOT NULL,
    interval TEXT NOT NULL,       -- 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w, 1M
    dt TEXT NOT NULL,             -- ISO8601 UTC datetime
    open REAL, high REAL, low REAL, close REAL,
    volume REAL,
    source TEXT,                  -- yfinance, tvdatafeed
    collected_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (instrument, interval, dt)
);

CREATE TABLE IF NOT EXISTS currency_strength (
    dt TEXT NOT NULL,             -- ISO8601 UTC date or datetime
    interval TEXT NOT NULL,       -- 1h, 1d
    currency TEXT NOT NULL,       -- USD, EUR, GBP, JPY, CAD, AUD, NZD, CHF
    index_value REAL,
    change_pct REAL,             -- vs previous bar
    rank INTEGER,                -- 1=strongest, 8=weakest
    source TEXT,
    PRIMARY KEY (dt, interval, currency)
);

CREATE TABLE IF NOT EXISTS snapshots (
    instrument TEXT NOT NULL,
    dt TEXT NOT NULL,
    price REAL,
    change_pct REAL,             -- vs previous close
    high REAL, low REAL,
    source TEXT,
    PRIMARY KEY (instrument, dt)
);

CREATE TABLE IF NOT EXISTS collection_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    instruments_requested INTEGER,
    instruments_collected INTEGER,
    errors TEXT,
    source TEXT,
    interval TEXT
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_inst_int ON ohlcv(instrument, interval);
CREATE INDEX IF NOT EXISTS idx_ohlcv_dt ON ohlcv(dt);
CREATE INDEX IF NOT EXISTS idx_cs_dt ON currency_strength(dt, interval);
CREATE INDEX IF NOT EXISTS idx_snap_inst ON snapshots(instrument);
"""

def get_conn(db_path=None):
    db_path = db_path or DEFAULT_DB
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

def init_db(db_path=None):
    conn = get_conn(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()
    print(f"Database initialized: {db_path or DEFAULT_DB}")

def upsert_ohlcv(conn, rows):
    """Insert or replace OHLCV rows. Each row: (instrument, interval, dt, o, h, l, c, vol, source)"""
    conn.executemany("""
        INSERT OR REPLACE INTO ohlcv (instrument, interval, dt, open, high, low, close, volume, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()

def upsert_currency_strength(conn, rows):
    """Insert or replace currency strength. Each row: (dt, interval, currency, index_value, change_pct, rank, source)"""
    conn.executemany("""
        INSERT OR REPLACE INTO currency_strength (dt, interval, currency, index_value, change_pct, rank, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()

def upsert_snapshots(conn, rows):
    """Insert or replace snapshots. Each row: (instrument, dt, price, change_pct, high, low, source)"""
    conn.executemany("""
        INSERT OR REPLACE INTO snapshots (instrument, dt, price, change_pct, high, low, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, rows)
    conn.commit()

if __name__ == "__main__":
    init_db()
