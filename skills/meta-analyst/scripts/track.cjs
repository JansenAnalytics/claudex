#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_DIR = path.join(require('os').homedir(), '.meta-analyst');
const DB_PATH = path.join(DB_DIR, 'events.db');

function getDb() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT DEFAULT '',
    duration_minutes INTEGER DEFAULT NULL,
    source TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  return db;
}

function parseDuration(s) {
  if (!s) return null;
  const m = s.match(/^(\d+)\s*(m|min|minutes?|h|hours?)$/i);
  if (!m) return parseInt(s) || null;
  const val = parseInt(m[1]);
  return m[2].startsWith('h') ? val * 60 : val;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] === '--help') {
    console.log('Usage: track.cjs <type> "message" [--category CAT] [--duration DUR] [--source SRC]');
    console.log('Types: error, success, retry, improvement, lesson');
    process.exit(args[0] === '--help' ? 0 : 1);
  }

  const type = args[0];
  const message = args[1];
  let category = '', duration = null, source = '';

  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--category' && args[i+1]) { category = args[++i]; }
    else if (args[i] === '--duration' && args[i+1]) { duration = parseDuration(args[++i]); }
    else if (args[i] === '--source' && args[i+1]) { source = args[++i]; }
  }

  const db = getDb();
  const stmt = db.prepare('INSERT INTO events (type, message, category, duration_minutes, source) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(type, message, category, duration, source);
  console.log(`Tracked ${type} event #${info.lastInsertRowid}: ${message}`);
  db.close();
}

main();
