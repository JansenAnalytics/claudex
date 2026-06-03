"""SQLite schema for sentiment data."""
import sqlite3, os

DEFAULT_DB = os.path.join(os.path.dirname(__file__), "..", "data", "sentiment.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS retail_sentiment (
    instrument TEXT NOT NULL,
    date TEXT NOT NULL,
    long_pct REAL,
    short_pct REAL,
    net_sentiment REAL,
    source TEXT,
    collected_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (instrument, date, source)
);

CREATE TABLE IF NOT EXISTS news_sentiment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument TEXT,
    asset_class TEXT,
    headline TEXT NOT NULL,
    source_name TEXT,
    url TEXT,
    sentiment_score REAL,
    sentiment_label TEXT,
    published_at TEXT,
    collected_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cot_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instrument TEXT NOT NULL,
    report_date TEXT NOT NULL,
    commercial_long INTEGER,
    commercial_short INTEGER,
    commercial_net INTEGER,
    non_commercial_long INTEGER,
    non_commercial_short INTEGER,
    non_commercial_net INTEGER,
    open_interest INTEGER,
    source TEXT DEFAULT 'cftc',
    collected_at TEXT DEFAULT (datetime('now')),
    UNIQUE(instrument, report_date)
);

CREATE TABLE IF NOT EXISTS fear_greed (
    date TEXT NOT NULL,
    index_type TEXT NOT NULL,
    value REAL,
    label TEXT,
    source TEXT,
    PRIMARY KEY (date, index_type)
);

CREATE TABLE IF NOT EXISTS composite_sentiment (
    instrument TEXT NOT NULL,
    date TEXT NOT NULL,
    score REAL,
    components TEXT,
    collected_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (instrument, date)
);

CREATE INDEX IF NOT EXISTS idx_rs_inst ON retail_sentiment(instrument);
CREATE INDEX IF NOT EXISTS idx_ns_inst ON news_sentiment(instrument);
CREATE INDEX IF NOT EXISTS idx_cot_inst ON cot_data(instrument);
"""

def get_conn(db_path=None):
    db_path = db_path or DEFAULT_DB
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db(db_path=None):
    conn = get_conn(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn

if __name__ == "__main__":
    init_db()
    print(f"Initialized: {DEFAULT_DB}")
