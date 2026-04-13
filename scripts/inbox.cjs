#!/usr/bin/env node
'use strict';
// inbox.cjs — Task inbox for Claude agent
// Usage: node scripts/inbox.cjs [--add "task"] [--list] [--pop] [--clear]
//                                [--done ID] [--priority high|normal|low]
//                                [--source cron|webhook|manual] [--json] [--all]

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Data file: one level up from scripts/ → data/inbox.json
const WORKSPACE = path.resolve(__dirname, '..');
const DATA_DIR = path.join(WORKSPACE, 'data');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.json');
const MAX_INBOX = 50;

// ── Helpers ─────────────────────────────────────────────────────────────────

function readInbox() {
  if (!fs.existsSync(INBOX_FILE)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(INBOX_FILE, '[]', 'utf8');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeInbox(tasks) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INBOX_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

function randomId() {
  return crypto.randomBytes(3).toString('hex');
}

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };
const PRIORITY_ICON  = { high: '🔴', normal: '🟡', low: '🔵' };

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 1;
    const pb = PRIORITY_ORDER[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    return new Date(a.queued_at) - new Date(b.queued_at);
  });
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)    return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function isoNow() {
  return new Date().toISOString();
}

// ── Parse args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { return args.includes(name); }
function flagVal(name) {
  const i = args.indexOf(name);
  return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
}

const doAdd      = flag('--add')    ? flagVal('--add')    : null;
const doList     = flag('--list');
const doPop      = flag('--pop');
const doAll      = flag('--all');
const doClear    = flag('--clear');
const doDone     = flag('--done')   ? flagVal('--done')   : null;
const asJson     = flag('--json');
const priority   = flagVal('--priority') || 'normal';
const source     = flagVal('--source')   || 'manual';

// ── Commands ─────────────────────────────────────────────────────────────────

// --add
if (doAdd !== null) {
  if (!doAdd) { console.error('Error: --add requires a task description'); process.exit(1); }
  const tasks = readInbox();
  const pending = tasks.filter(t => t.status === 'pending');
  if (pending.length >= MAX_INBOX) {
    console.warn(`⚠️  Inbox has ${pending.length} pending tasks (max ${MAX_INBOX}). Consider processing some first.`);
  }
  if (!['high', 'normal', 'low'].includes(priority)) {
    console.error('Error: --priority must be high, normal, or low'); process.exit(1);
  }
  if (!['cron', 'webhook', 'manual'].includes(source)) {
    console.error('Error: --source must be cron, webhook, or manual'); process.exit(1);
  }
  const task = {
    id: randomId(),
    task: doAdd,
    source,
    priority,
    queued_at: isoNow(),
    status: 'pending'
  };
  tasks.push(task);
  writeInbox(tasks);
  if (asJson) {
    console.log(JSON.stringify(task, null, 2));
  } else {
    const icon = PRIORITY_ICON[priority];
    console.log(`${icon} Added [${task.id}] ${task.task}`);
    console.log(`   source=${source} priority=${priority} queued_at=${task.queued_at}`);
  }
  process.exit(0);
}

// --list
if (doList) {
  const tasks = readInbox();
  const pending = sortTasks(tasks.filter(t => t.status === 'pending'));
  if (asJson) {
    console.log(JSON.stringify(pending, null, 2));
    process.exit(0);
  }
  console.log(`📥 Inbox (${pending.length} pending)`);
  if (pending.length === 0) {
    console.log('  (empty)');
  } else {
    for (const t of pending) {
      const icon = PRIORITY_ICON[t.priority] || '🟡';
      const age  = relativeTime(t.queued_at);
      const label = `[${t.id}] ${t.task}`;
      console.log(`  ${icon} ${label.padEnd(48)} (${t.source}, ${age})`);
    }
  }
  process.exit(0);
}

// --pop
if (doPop) {
  const tasks = readInbox();
  const pending = sortTasks(tasks.filter(t => t.status === 'pending'));
  if (pending.length === 0) {
    if (asJson) { console.log('[]'); } else { console.log('📭 Inbox is empty'); }
    process.exit(0);
  }
  if (doAll) {
    // Remove all pending
    const ids = new Set(pending.map(t => t.id));
    const remaining = tasks.filter(t => !ids.has(t.id));
    writeInbox(remaining);
    console.log(JSON.stringify(pending, null, 2));
    process.exit(0);
  }
  // Pop one
  const top = pending[0];
  const remaining = tasks.filter(t => t.id !== top.id);
  writeInbox(remaining);
  console.log(JSON.stringify(top, null, 2));
  process.exit(0);
}

// --done ID
if (doDone !== null) {
  if (!doDone) { console.error('Error: --done requires a task ID'); process.exit(1); }
  const tasks = readInbox();
  const idx = tasks.findIndex(t => t.id === doDone);
  if (idx === -1) { console.error(`Error: task ${doDone} not found`); process.exit(1); }
  tasks[idx].status = 'done';
  tasks[idx].completed_at = isoNow();
  writeInbox(tasks);
  if (asJson) {
    console.log(JSON.stringify(tasks[idx], null, 2));
  } else {
    console.log(`✅ Marked [${doDone}] as done`);
  }
  process.exit(0);
}

// --clear
if (doClear) {
  const tasks = readInbox();
  const before = tasks.length;
  const kept = tasks.filter(t => t.status !== 'done');
  writeInbox(kept);
  const removed = before - kept.length;
  if (asJson) {
    console.log(JSON.stringify({ removed, remaining: kept.length }));
  } else {
    console.log(`🗑️  Cleared ${removed} completed task(s). ${kept.length} remaining.`);
  }
  process.exit(0);
}

// No command given
console.error('Usage: node scripts/inbox.cjs [--add "task"] [--list] [--pop [--all]] [--done ID] [--clear]');
console.error('       Optional: --priority high|normal|low  --source cron|webhook|manual  --json');
process.exit(1);
