"""SQLite schema for economic data storage."""
import sqlite3
import os

DEFAULT_DB = os.path.join(os.path.dirname(__file__), "..", "data", "economic.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS economic_series (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL,
    country TEXT NOT NULL,
    indicator TEXT NOT NULL,
    frequency TEXT,
    date TEXT NOT NULL,
    value REAL,
    previous REAL,
    forecast REAL,
    surprise REAL,
    source TEXT,
    collected_at TEXT DEFAULT (datetime('now')),
    UNIQUE(series_id, date)
);

CREATE TABLE IF NOT EXISTS central_bank_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT NOT NULL,
    bank TEXT NOT NULL,
    rate REAL NOT NULL,
    date TEXT NOT NULL,
    change_bp REAL,
    next_meeting TEXT,
    UNIQUE(bank, date)
);

CREATE TABLE IF NOT EXISTS yield_curves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT NOT NULL,
    date TEXT NOT NULL,
    tenor TEXT NOT NULL,
    yield_pct REAL,
    change_bp REAL,
    source TEXT,
    collected_at TEXT DEFAULT (datetime('now')),
    UNIQUE(country, date, tenor)
);

CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT,
    country TEXT NOT NULL,
    indicator TEXT NOT NULL,
    impact TEXT,
    actual TEXT,
    forecast TEXT,
    previous TEXT,
    source TEXT,
    collected_at TEXT DEFAULT (datetime('now')),
    UNIQUE(date, country, indicator)
);

CREATE INDEX IF NOT EXISTS idx_es_country ON economic_series(country, indicator);
CREATE INDEX IF NOT EXISTS idx_es_date ON economic_series(date);
CREATE INDEX IF NOT EXISTS idx_cbr_bank ON central_bank_rates(bank);
CREATE INDEX IF NOT EXISTS idx_yc_country ON yield_curves(country, date);
CREATE INDEX IF NOT EXISTS idx_cal_date ON calendar_events(date);
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
    return conn

if __name__ == "__main__":
    init_db()
    print(f"Database initialized: {DEFAULT_DB}")
