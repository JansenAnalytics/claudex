#!/usr/bin/env node
"use strict";

/**
 * event-log.cjs — Append-only structured event log for Kite continuity.
 *
 * CLI:
 *   node event-log.cjs log --type note --summary "Started working on X"
 *   node event-log.cjs tail [--n 20]
 *   node event-log.cjs today
 *   node event-log.cjs search "stock"
 *   node event-log.cjs type notification_sent
 *   node event-log.cjs since "2026-02-21"
 *   node event-log.cjs stats
 *
 * Programmatic:
 *   const { logEvent } = require(require('os').homedir() + '/projects/event-log/event-log.cjs');
 *   logEvent('note', 'Started working on X', { tag: 'manual' });
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Config ──────────────────────────────────────────────────────────────────

const EVENTS_FILE = path.join(os.homedir(), ".openclaw", "events.jsonl");

const VALID_TYPES = [
  "skill_created",
  "project_created",
  "project_updated",
  "notification_sent",
  "cron_ran",
  "alert_fired",
  "task_completed",
  "error",
  "note",
  "session_start",
  "session_end",
];

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Append one event to the JSONL file.
 * @param {string} type - Event type (see VALID_TYPES)
 * @param {string} summary - Human-readable summary
 * @param {object} [meta] - Optional extra metadata
 * @param {string} [session] - Session label (auto-detected from env if omitted)
 * @returns {object} The written event object
 */
function logEvent(type, summary, meta = {}, session = null) {
  if (!type) throw new Error("logEvent: type is required");
  if (!summary) throw new Error("logEvent: summary is required");

  // Ensure the directory exists
  const dir = path.dirname(EVENTS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const event = {
    ts: new Date().toISOString(),
    type,
    session: session || process.env.OPENCLAW_SESSION || process.env.SESSION_ID || "unknown",
    summary,
    meta: meta || {},
  };

  const line = JSON.stringify(event) + "\n";
  fs.appendFileSync(EVENTS_FILE, line, "utf8");
  return event;
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

function readAllEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  const raw = fs.readFileSync(EVENTS_FILE, "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line);
      } catch {
        return null; // skip malformed lines
      }
    })
    .filter(Boolean);
}

function formatEvent(ev) {
  const ts = new Date(ev.ts).toLocaleString("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false,
  });
  const metaStr = Object.keys(ev.meta || {}).length ? "  " + JSON.stringify(ev.meta) : "";
  return `[${ts}] [${ev.type}] ${ev.summary}${metaStr}`;
}

// ─── CLI commands ─────────────────────────────────────────────────────────────

function cmdLog(args) {
  // Parse --type, --summary, --session, --meta (JSON string)
  let type = null,
    summary = null,
    session = null,
    meta = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--type" && args[i + 1]) {
      type = args[++i];
    } else if (args[i] === "--summary" && args[i + 1]) {
      summary = args[++i];
    } else if (args[i] === "--session" && args[i + 1]) {
      session = args[++i];
    } else if (args[i] === "--meta" && args[i + 1]) {
      try {
        meta = JSON.parse(args[++i]);
      } catch {
        meta = {};
      }
    }
  }
  if (!type) {
    console.error("Error: --type is required");
    process.exit(1);
  }
  if (!summary) {
    console.error("Error: --summary is required");
    process.exit(1);
  }

  const ev = logEvent(type, summary, meta, session);
  console.log("✓ Event logged:", formatEvent(ev));
}

function cmdTail(args) {
  let n = 20;
  const nIdx = args.indexOf("--n");
  if (nIdx !== -1 && args[nIdx + 1]) n = parseInt(args[nIdx + 1], 10);

  const events = readAllEvents();
  const slice = events.slice(-n);
  if (slice.length === 0) {
    console.log("(no events)");
    return;
  }
  slice.forEach((ev) => console.log(formatEvent(ev)));
  console.log(`\n— ${slice.length} of ${events.length} events —`);
}

function cmdToday() {
  const today = new Date().toISOString().slice(0, 10);
  const events = readAllEvents().filter((ev) => ev.ts && ev.ts.startsWith(today));
  if (events.length === 0) {
    console.log("No events today.");
    return;
  }
  events.forEach((ev) => console.log(formatEvent(ev)));
  console.log(`\n— ${events.length} events today —`);
}

function cmdSearch(args) {
  const query = args[0];
  if (!query) {
    console.error("Usage: search <query>");
    process.exit(1);
  }
  const lower = query.toLowerCase();
  const events = readAllEvents().filter(
    (ev) =>
      (ev.summary || "").toLowerCase().includes(lower) ||
      JSON.stringify(ev.meta || {})
        .toLowerCase()
        .includes(lower),
  );
  if (events.length === 0) {
    console.log(`No events matching "${query}"`);
    return;
  }
  events.forEach((ev) => console.log(formatEvent(ev)));
  console.log(`\n— ${events.length} match(es) for "${query}" —`);
}

function cmdType(args) {
  const typeFilter = args[0];
  if (!typeFilter) {
    console.error("Usage: type <event_type>");
    process.exit(1);
  }
  const events = readAllEvents().filter((ev) => ev.type === typeFilter);
  if (events.length === 0) {
    console.log(`No events of type "${typeFilter}"`);
    return;
  }
  events.forEach((ev) => console.log(formatEvent(ev)));
  console.log(`\n— ${events.length} event(s) of type "${typeFilter}" —`);
}

function cmdSince(args) {
  const dateStr = args[0];
  if (!dateStr) {
    console.error("Usage: since <YYYY-MM-DD>");
    process.exit(1);
  }
  const cutoff = new Date(dateStr).toISOString();
  const events = readAllEvents().filter((ev) => ev.ts >= cutoff);
  if (events.length === 0) {
    console.log(`No events since ${dateStr}`);
    return;
  }
  events.forEach((ev) => console.log(formatEvent(ev)));
  console.log(`\n— ${events.length} event(s) since ${dateStr} —`);
}

function cmdStats() {
  const events = readAllEvents();
  if (events.length === 0) {
    console.log("No events yet.");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const byType = {};
  let todayCount = 0;
  let weekCount = 0;

  for (const ev of events) {
    byType[ev.type] = (byType[ev.type] || 0) + 1;
    if (ev.ts && ev.ts.startsWith(today)) todayCount++;
    if (ev.ts >= weekAgo) weekCount++;
  }

  console.log("═══════════════════════════════");
  console.log("  Event Log Stats");
  console.log("═══════════════════════════════");
  console.log(`  Total events : ${events.length}`);
  console.log(`  Today        : ${todayCount}`);
  console.log(`  This week    : ${weekCount}`);
  console.log("───────────────────────────────");
  console.log("  By type:");

  const sorted = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sorted) {
    const bar = "█".repeat(Math.min(count, 30));
    console.log(`    ${type.padEnd(22)} ${String(count).padStart(3)}  ${bar}`);
  }
  console.log("═══════════════════════════════");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const [, , cmd, ...rest] = process.argv;

  switch (cmd) {
    case "log":
      return cmdLog(rest);
    case "tail":
      return cmdTail(rest);
    case "today":
      return cmdToday();
    case "search":
      return cmdSearch(rest);
    case "type":
      return cmdType(rest);
    case "since":
      return cmdSince(rest);
    case "stats":
      return cmdStats();
    default:
      console.log(`event-log.cjs — Kite's structured event log

Commands:
  log --type <type> --summary "<text>" [--meta '{"key":"val"}']
  tail [--n 20]
  today
  search <query>
  type <event_type>
  since <YYYY-MM-DD>
  stats

Event types: ${VALID_TYPES.join(", ")}

Events file: ${EVENTS_FILE}`);
  }
}

// Run CLI only when invoked directly
if (require.main === module) {
  main();
}

// Export programmatic API
module.exports = { logEvent, readAllEvents, EVENTS_FILE, VALID_TYPES };
