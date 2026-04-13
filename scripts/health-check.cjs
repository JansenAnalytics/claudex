#!/usr/bin/env node
// health-check.cjs — Claudex health metrics tracker
// Run with: node --experimental-sqlite health-check.cjs [--record EVENT] [--report] [--json] [--prune]
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

// ── Database path ──────────────────────────────────────────────────────────────
const WORKSPACE = process.env.CLAUDEX_WORKSPACE || path.join(os.homedir(), '.claude-agent');
const DB_PATH = path.join(WORKSPACE, 'data', 'health.sqlite');

// ── Open DB & ensure schema ────────────────────────────────────────────────────
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    event     TEXT    NOT NULL,
    timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
    details   TEXT
  );

  CREATE TABLE IF NOT EXISTS daily_stats (
    date           TEXT    PRIMARY KEY,
    sessions       INTEGER NOT NULL DEFAULT 0,
    restarts       INTEGER NOT NULL DEFAULT 0,
    uptime_minutes INTEGER NOT NULL DEFAULT 0,
    updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// ── Helpers ────────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function fmtTs(unixSec) {
  if (!unixSec) return 'none';
  const d = new Date(unixSec * 1000);
  const ymd = d.toISOString().slice(0, 10);
  const hm  = d.toTimeString().slice(0, 5);
  return `${ymd} ${hm}`;
}

function ensureDay(date) {
  db.prepare(`
    INSERT OR IGNORE INTO daily_stats (date, sessions, restarts, uptime_minutes, updated_at)
    VALUES (?, 0, 0, 0, unixepoch())
  `).run(date);
}

// ── --record ───────────────────────────────────────────────────────────────────
function recordEvent(event, details) {
  db.prepare(`INSERT INTO events (event, details) VALUES (?, ?)`).run(event, details || null);

  const d = today();

  if (event === 'session_start') {
    ensureDay(d);
    db.prepare(`
      UPDATE daily_stats SET sessions = sessions + 1, updated_at = unixepoch()
      WHERE date = ?
    `).run(d);
  } else if (event === 'restart') {
    ensureDay(d);
    db.prepare(`
      UPDATE daily_stats SET restarts = restarts + 1, updated_at = unixepoch()
      WHERE date = ?
    `).run(d);
  } else if (event === 'watchdog_ok') {
    ensureDay(d);
    // Each watchdog_ok = 5 minutes of uptime
    db.prepare(`
      UPDATE daily_stats SET uptime_minutes = uptime_minutes + 5, updated_at = unixepoch()
      WHERE date = ?
    `).run(d);
  }
  // session_stop and watchdog_restart just log the event
}

// ── --report ───────────────────────────────────────────────────────────────────
function report(asJson) {
  const d = today();

  // Today's stats from daily_stats
  const row = db.prepare(`SELECT * FROM daily_stats WHERE date = ?`).get(d) || {
    sessions: 0, restarts: 0, uptime_minutes: 0
  };

  // Restarts in last 7 days
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const restarts7d = db.prepare(`
    SELECT COUNT(*) AS cnt FROM events
    WHERE event = 'restart' AND timestamp >= ?
  `).get(sevenDaysAgo)?.cnt ?? 0;

  // Last session_start timestamp
  const lastSession = db.prepare(`
    SELECT timestamp FROM events WHERE event = 'session_start' ORDER BY id DESC LIMIT 1
  `).get()?.timestamp ?? null;

  // Last restart timestamp
  const lastRestart = db.prepare(`
    SELECT timestamp FROM events WHERE event = 'restart' ORDER BY id DESC LIMIT 1
  `).get()?.timestamp ?? null;

  // Avg sessions/day over 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
  const avgRow = db.prepare(`
    SELECT AVG(sessions) AS avg FROM daily_stats WHERE date >= ?
  `).get(thirtyDaysAgo);
  const avgSessions = avgRow?.avg ?? 0;

  // Uptime formatting
  const totalMinutes = row.uptime_minutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins  = totalMinutes % 60;
  const uptimeStr = `${hours}h ${mins}m`;

  if (asJson) {
    console.log(JSON.stringify({
      uptime_today: uptimeStr,
      uptime_minutes_today: totalMinutes,
      sessions_today: row.sessions,
      restarts_today: row.restarts,
      restarts_7d: restarts7d,
      last_session: lastSession ? fmtTs(lastSession) : null,
      last_restart: lastRestart ? fmtTs(lastRestart) : null,
      avg_sessions_per_day_30d: Math.round(avgSessions * 10) / 10
    }, null, 2));
  } else {
    console.log('📊 Claudex Health Report');
    console.log(`   Uptime (today):          ${uptimeStr}`);
    console.log(`   Sessions (today):         ${row.sessions}`);
    console.log(`   Restarts (today):         ${row.restarts}`);
    console.log(`   Restarts (7d):            ${restarts7d}`);
    console.log(`   Last session:             ${lastSession ? fmtTs(lastSession) : 'none'}`);
    console.log(`   Last restart:             ${lastRestart ? fmtTs(lastRestart) : 'none'}`);
    console.log(`   Avg sessions/day (30d):   ${Math.round(avgSessions * 10) / 10}`);
  }
}

// ── --prune ────────────────────────────────────────────────────────────────────
function prune() {
  const cutoff = Math.floor(Date.now() / 1000) - 90 * 86400;
  const result = db.prepare(`DELETE FROM events WHERE timestamp < ?`).run(cutoff);
  console.log(`🗑️  Pruned ${result.changes} events older than 90 days`);
}

// ── CLI parsing ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

const recordIdx = args.indexOf('--record');
const doReport  = args.includes('--report');
const doJson    = args.includes('--json');
const doPrune   = args.includes('--prune');

if (recordIdx !== -1) {
  const event = args[recordIdx + 1];
  if (!event) {
    console.error('Usage: --record <event>');
    process.exit(1);
  }
  const validEvents = ['session_start', 'session_stop', 'restart', 'watchdog_ok', 'watchdog_restart'];
  if (!validEvents.includes(event)) {
    console.error(`Unknown event: ${event}. Valid: ${validEvents.join(', ')}`);
    process.exit(1);
  }
  recordEvent(event);
} else if (doReport) {
  report(doJson);
} else if (doPrune) {
  prune();
} else {
  console.log('Usage: health-check.cjs [--record EVENT] [--report [--json]] [--prune]');
  console.log('Events: session_start, session_stop, restart, watchdog_ok, watchdog_restart');
}

db.close();
