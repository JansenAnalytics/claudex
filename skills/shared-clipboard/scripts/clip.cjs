#!/usr/bin/env node
/**
 * Shared Clipboard — Cross-session key-value snippet store
 * 
 * A persistent clipboard for sharing text, code, data, URLs, and notes
 * between agents, sessions, devices, and humans.
 * 
 * Storage: SQLite at ~/.clipboard/clips.db
 * 
 * Commands:
 *   clip set <key> <value>         — Store a value (stdin if value omitted)
 *   clip get <key>                 — Retrieve a value
 *   clip del <key>                 — Delete a key
 *   clip list [--tag TAG] [--recent N] [--search QUERY]
 *   clip tags                      — List all tags
 *   clip push <value>              — Push to unnamed stack (auto-key: stack_N)
 *   clip pop                       — Pop most recent stack item
 *   clip peek                      — View most recent stack item
 *   clip copy <from> <to>          — Copy value to new key
 *   clip rename <old> <new>        — Rename a key
 *   clip export [--format json|csv|md] [--tag TAG]
 *   clip import <file>             — Import from JSON export
 *   clip stats                     — Usage statistics
 *   clip gc [--older-than 30d]     — Garbage collect old clips
 *   clip pin <key>                 — Pin (protect from gc)
 *   clip unpin <key>               — Unpin
 *   clip share <key>               — Output in easily pasteable format
 *   clip diff <key1> <key2>        — Show diff between two clips
 *   clip history <key>             — Show version history of a key
 *   clip append <key> <value>      — Append to existing value
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== DATABASE ====================

const DB_DIR = path.join(process.env.HOME, '.clipboard');
const DB_PATH = path.join(DB_DIR, 'clips.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// Resolve better-sqlite3
let Database;
const searchPaths = [
  path.join(__dirname, 'node_modules', 'better-sqlite3'),
  path.join(__dirname, '..', 'node_modules', 'better-sqlite3'),
  path.join(process.env.HOME, 'openclaw', 'skills', 'kanban-agent', 'node_modules', 'better-sqlite3'),
];

for (const p of searchPaths) {
  try {
    Database = require(p);
    break;
  } catch {}
}

if (!Database) {
  console.error('ERROR: better-sqlite3 not found. Run:');
  console.error('  ln -sf ~/openclaw/skills/kanban-agent/node_modules ~/openclaw/skills/shared-clipboard/node_modules');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ==================== SCHEMA ====================

db.exec(`
  CREATE TABLE IF NOT EXISTS clips (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',
    tags TEXT DEFAULT '',
    source TEXT DEFAULT '',
    pinned INTEGER DEFAULT 0,
    size INTEGER DEFAULT 0,
    hash TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    accessed_at TEXT DEFAULT (datetime('now')),
    access_count INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS clip_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    version INTEGER NOT NULL,
    changed_at TEXT DEFAULT (datetime('now')),
    changed_by TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS stack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    value TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_clips_tags ON clips(tags);
  CREATE INDEX IF NOT EXISTS idx_clips_updated ON clips(updated_at);
  CREATE INDEX IF NOT EXISTS idx_clips_accessed ON clips(accessed_at);
  CREATE INDEX IF NOT EXISTS idx_history_key ON clip_history(key);
`);

// ==================== HELPERS ====================

function detectContentType(value) {
  if (!value) return 'text';
  const trimmed = value.trim();
  
  // JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return 'json'; } catch {}
  }
  
  // URL
  if (/^https?:\/\/\S+$/.test(trimmed)) return 'url';
  
  // Code detection
  if (/^(import |from |const |let |var |function |def |class |#include|package |use )/.test(trimmed))
    return 'code';
  if (/```/.test(trimmed)) return 'code';
  
  // Multiline = probably code or data
  if (trimmed.split('\n').length > 5) return 'multiline';
  
  // SQL
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/i.test(trimmed)) return 'sql';
  
  // Path
  if (/^[\/~][\w\/\-\.]+$/.test(trimmed)) return 'path';
  
  // Command
  if (/^(curl|wget|docker|git|npm|pip|apt|brew|ssh|scp)\s/.test(trimmed)) return 'command';
  
  return 'text';
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function parseTags(tagStr) {
  if (!tagStr) return [];
  return tagStr.split(',').map(t => t.trim()).filter(Boolean);
}

function formatTags(tags) {
  if (Array.isArray(tags)) return tags.join(',');
  return tags || '';
}

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function truncate(str, len = 80) {
  if (!str) return '';
  const oneline = str.replace(/\n/g, '↵ ');
  return oneline.length > len ? oneline.slice(0, len - 1) + '…' : oneline;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function readStdin() {
  try {
    return fs.readFileSync('/dev/stdin', 'utf8');
  } catch {
    return null;
  }
}

// ==================== COMMANDS ====================

const commands = {};

commands.set = function(args) {
  const key = args[0];
  if (!key) {
    console.error('Usage: clip set <key> [value] [--tag TAG] [--source SOURCE]');
    console.error('  If value omitted, reads from stdin (pipe or file)');
    process.exit(1);
  }

  // Parse flags
  let tags = '', source = '';
  const flagless = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--tag' || args[i] === '-t') { tags = args[++i] || ''; }
    else if (args[i] === '--source' || args[i] === '-s') { source = args[++i] || ''; }
    else { flagless.push(args[i]); }
  }

  let value = flagless.join(' ');
  
  // If no value provided, try stdin
  if (!value) {
    if (!process.stdin.isTTY) {
      value = readStdin();
    }
    if (!value) {
      console.error('No value provided. Pass as argument or pipe via stdin.');
      process.exit(1);
    }
  }

  const contentType = detectContentType(value);
  const hash = hashValue(value);
  const size = Buffer.byteLength(value, 'utf8');

  // Check if key exists (for versioning)
  const existing = db.prepare('SELECT value, version FROM clips WHERE key = ?').get(key);
  let version = 1;

  if (existing) {
    version = existing.version + 1;
    // Save to history
    db.prepare(
      'INSERT INTO clip_history (key, value, version, changed_by) VALUES (?, ?, ?, ?)'
    ).run(key, existing.value, existing.version, source);

    db.prepare(`
      UPDATE clips SET value = ?, content_type = ?, tags = CASE WHEN ? = '' THEN tags ELSE ? END,
      source = CASE WHEN ? = '' THEN source ELSE ? END,
      size = ?, hash = ?, updated_at = datetime('now'), version = ?
      WHERE key = ?
    `).run(value, contentType, tags, tags, source, source, size, hash, version, key);
  } else {
    db.prepare(`
      INSERT INTO clips (key, value, content_type, tags, source, size, hash, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(key, value, contentType, tags, source, size, hash, version);
  }

  const verb = existing ? 'Updated' : 'Saved';
  console.log(`✅ ${verb} "${key}" (${contentType}, ${humanSize(size)}, v${version})`);
};

commands.get = function(args) {
  const key = args[0];
  if (!key) {
    console.error('Usage: clip get <key>');
    process.exit(1);
  }

  const row = db.prepare('SELECT * FROM clips WHERE key = ?').get(key);
  if (!row) {
    // Try fuzzy match
    const fuzzy = db.prepare("SELECT key FROM clips WHERE key LIKE ? ORDER BY updated_at DESC LIMIT 5")
      .all(`%${key}%`);
    if (fuzzy.length) {
      console.error(`Key "${key}" not found. Did you mean:`);
      fuzzy.forEach(r => console.error(`  • ${r.key}`));
    } else {
      console.error(`Key "${key}" not found.`);
    }
    process.exit(1);
  }

  // Update access stats
  db.prepare(
    'UPDATE clips SET accessed_at = datetime(\'now\'), access_count = access_count + 1 WHERE key = ?'
  ).run(key);

  // Output raw value (for piping)
  process.stdout.write(row.value);
  
  // If stdout is a TTY, add metadata footer
  if (process.stdout.isTTY) {
    if (!row.value.endsWith('\n')) console.log();
    console.error(`  [${row.content_type}] ${humanSize(row.size)} | v${row.version} | ${timeAgo(row.updated_at)} | accessed ${row.access_count + 1}×`);
    if (row.tags) console.error(`  tags: ${row.tags}`);
  }
};

commands.del = function(args) {
  const key = args[0];
  if (!key) { console.error('Usage: clip del <key>'); process.exit(1); }

  const row = db.prepare('SELECT pinned FROM clips WHERE key = ?').get(key);
  if (!row) { console.error(`Key "${key}" not found.`); process.exit(1); }
  if (row.pinned) { console.error(`Key "${key}" is pinned. Unpin first: clip unpin ${key}`); process.exit(1); }

  db.prepare('DELETE FROM clip_history WHERE key = ?').run(key);
  db.prepare('DELETE FROM clips WHERE key = ?').run(key);
  console.log(`🗑️  Deleted "${key}"`);
};

commands.list = function(args) {
  let tag = '', search = '', recent = 0, limit = 50, showAll = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' || args[i] === '-t') { tag = args[++i] || ''; }
    else if (args[i] === '--search' || args[i] === '-s') { search = args[++i] || ''; }
    else if (args[i] === '--recent' || args[i] === '-r') { recent = parseInt(args[++i]) || 10; }
    else if (args[i] === '--limit' || args[i] === '-l') { limit = parseInt(args[++i]) || 50; }
    else if (args[i] === '--all' || args[i] === '-a') { showAll = true; }
  }

  let query = 'SELECT key, content_type, tags, size, pinned, updated_at, access_count, version FROM clips WHERE 1=1';
  const params = [];

  if (tag) {
    query += " AND (',' || tags || ',') LIKE ?";
    params.push(`%,${tag},%`);
  }
  if (search) {
    query += ' AND (key LIKE ? OR value LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY updated_at DESC';
  if (!showAll) query += ` LIMIT ${limit}`;

  const rows = db.prepare(query).all(...params);

  if (!rows.length) {
    console.log('No clips found.');
    return;
  }

  // Header
  console.log(`${'KEY'.padEnd(25)} ${'TYPE'.padEnd(10)} ${'SIZE'.padEnd(8)} ${'V'.padEnd(3)} ${'PIN'.padEnd(4)} ${'UPDATED'.padEnd(12)} ${'TAGS'}`);
  console.log('─'.repeat(90));

  for (const r of rows) {
    const pin = r.pinned ? '📌' : '  ';
    console.log(
      `${r.key.padEnd(25).slice(0, 25)} ${r.content_type.padEnd(10)} ${humanSize(r.size).padEnd(8)} ${('v' + r.version).padEnd(3)} ${pin.padEnd(4)} ${timeAgo(r.updated_at).padEnd(12)} ${r.tags || ''}`
    );
  }

  console.log(`\n${rows.length} clip(s)${tag ? ` [tag: ${tag}]` : ''}${search ? ` [search: ${search}]` : ''}`);
};

commands.tags = function() {
  const rows = db.prepare("SELECT tags FROM clips WHERE tags != ''").all();
  const tagCounts = {};
  for (const r of rows) {
    for (const tag of parseTags(r.tags)) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) { console.log('No tags found.'); return; }

  for (const [tag, count] of sorted) {
    console.log(`  ${tag} (${count})`);
  }
};

commands.push = function(args) {
  let value = args.join(' ');
  if (!value && !process.stdin.isTTY) {
    value = readStdin();
  }
  if (!value) { console.error('Usage: clip push <value>'); process.exit(1); }

  const result = db.prepare('INSERT INTO stack (value) VALUES (?)').run(value);
  const count = db.prepare('SELECT count(*) as cnt FROM stack').get().cnt;
  console.log(`📥 Pushed to stack (${count} items)`);
};

commands.pop = function() {
  const row = db.prepare('SELECT * FROM stack ORDER BY id DESC LIMIT 1').get();
  if (!row) { console.log('Stack is empty.'); return; }

  db.prepare('DELETE FROM stack WHERE id = ?').run(row.id);
  process.stdout.write(row.value);
  if (process.stdout.isTTY && !row.value.endsWith('\n')) console.log();

  const count = db.prepare('SELECT count(*) as cnt FROM stack').get().cnt;
  if (process.stdout.isTTY) console.error(`  (${count} items remaining)`);
};

commands.peek = function() {
  const row = db.prepare('SELECT * FROM stack ORDER BY id DESC LIMIT 1').get();
  if (!row) { console.log('Stack is empty.'); return; }
  process.stdout.write(row.value);
  if (process.stdout.isTTY && !row.value.endsWith('\n')) console.log();
};

commands.copy = function(args) {
  const [from, to] = args;
  if (!from || !to) { console.error('Usage: clip copy <from-key> <to-key>'); process.exit(1); }

  const row = db.prepare('SELECT * FROM clips WHERE key = ?').get(from);
  if (!row) { console.error(`Key "${from}" not found.`); process.exit(1); }

  commands.set([to, row.value, '--tag', row.tags, '--source', `copied from ${from}`]);
};

commands.rename = function(args) {
  const [oldKey, newKey] = args;
  if (!oldKey || !newKey) { console.error('Usage: clip rename <old> <new>'); process.exit(1); }

  const row = db.prepare('SELECT * FROM clips WHERE key = ?').get(oldKey);
  if (!row) { console.error(`Key "${oldKey}" not found.`); process.exit(1); }

  const existing = db.prepare('SELECT key FROM clips WHERE key = ?').get(newKey);
  if (existing) { console.error(`Key "${newKey}" already exists.`); process.exit(1); }

  db.prepare('UPDATE clips SET key = ? WHERE key = ?').run(newKey, oldKey);
  db.prepare('UPDATE clip_history SET key = ? WHERE key = ?').run(newKey, oldKey);
  console.log(`✅ Renamed "${oldKey}" → "${newKey}"`);
};

commands.export = function(args) {
  let format = 'json', tag = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' || args[i] === '-f') { format = args[++i] || 'json'; }
    else if (args[i] === '--tag' || args[i] === '-t') { tag = args[++i] || ''; }
  }

  let query = 'SELECT * FROM clips WHERE 1=1';
  const params = [];
  if (tag) {
    query += " AND (',' || tags || ',') LIKE ?";
    params.push(`%,${tag},%`);
  }
  query += ' ORDER BY key';

  const rows = db.prepare(query).all(...params);

  if (format === 'json') {
    console.log(JSON.stringify(rows, null, 2));
  } else if (format === 'csv') {
    console.log('key,value,content_type,tags,source,pinned,created_at,updated_at');
    for (const r of rows) {
      const escaped = r.value.replace(/"/g, '""');
      console.log(`"${r.key}","${escaped}","${r.content_type}","${r.tags}","${r.source}",${r.pinned},"${r.created_at}","${r.updated_at}"`);
    }
  } else if (format === 'md') {
    for (const r of rows) {
      const pin = r.pinned ? ' 📌' : '';
      console.log(`### ${r.key}${pin}`);
      if (r.tags) console.log(`Tags: ${r.tags}`);
      console.log(`\`\`\`${r.content_type === 'code' ? '' : ''}`);
      console.log(r.value);
      console.log('```\n');
    }
  }
};

commands.import = function(args) {
  const file = args[0];
  if (!file) { console.error('Usage: clip import <file.json>'); process.exit(1); }

  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  let imported = 0;

  for (const item of data) {
    if (!item.key || !item.value) continue;
    const existing = db.prepare('SELECT key FROM clips WHERE key = ?').get(item.key);
    if (!existing) {
      db.prepare(`
        INSERT INTO clips (key, value, content_type, tags, source, pinned, size, hash, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.key, item.value, item.content_type || 'text', item.tags || '',
        item.source || 'import', item.pinned || 0,
        Buffer.byteLength(item.value, 'utf8'), hashValue(item.value), item.version || 1
      );
      imported++;
    }
  }

  console.log(`✅ Imported ${imported} clip(s) (${data.length - imported} skipped/duplicate)`);
};

commands.stats = function() {
  const total = db.prepare('SELECT count(*) as cnt FROM clips').get().cnt;
  const totalSize = db.prepare('SELECT coalesce(sum(size), 0) as total FROM clips').get().total;
  const pinned = db.prepare('SELECT count(*) as cnt FROM clips WHERE pinned = 1').get().cnt;
  const stackSize = db.prepare('SELECT count(*) as cnt FROM stack').get().cnt;
  const historySize = db.prepare('SELECT count(*) as cnt FROM clip_history').get().cnt;
  const types = db.prepare('SELECT content_type, count(*) as cnt FROM clips GROUP BY content_type ORDER BY cnt DESC').all();
  const topAccessed = db.prepare('SELECT key, access_count FROM clips ORDER BY access_count DESC LIMIT 5').all();
  const recentlyUpdated = db.prepare('SELECT key, updated_at FROM clips ORDER BY updated_at DESC LIMIT 5').all();

  console.log('📋 Clipboard Stats');
  console.log('─'.repeat(40));
  console.log(`  Total clips:     ${total}`);
  console.log(`  Total size:      ${humanSize(totalSize)}`);
  console.log(`  Pinned:          ${pinned}`);
  console.log(`  Stack items:     ${stackSize}`);
  console.log(`  History entries:  ${historySize}`);
  console.log(`  DB file:         ${DB_PATH}`);
  console.log(`  DB size:         ${humanSize(fs.statSync(DB_PATH).size)}`);

  if (types.length) {
    console.log('\n  Content types:');
    for (const t of types) console.log(`    ${t.content_type}: ${t.cnt}`);
  }

  if (topAccessed.length && topAccessed[0].access_count > 0) {
    console.log('\n  Most accessed:');
    for (const r of topAccessed) {
      if (r.access_count > 0) console.log(`    ${r.key}: ${r.access_count}×`);
    }
  }

  if (recentlyUpdated.length) {
    console.log('\n  Recently updated:');
    for (const r of recentlyUpdated) console.log(`    ${r.key}: ${timeAgo(r.updated_at)}`);
  }
};

commands.gc = function(args) {
  let olderThan = '30d';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--older-than') olderThan = args[++i] || '30d';
  }

  const match = olderThan.match(/^(\d+)([dhm])$/);
  if (!match) { console.error('Invalid duration. Use format: 30d, 24h, 60m'); process.exit(1); }

  const num = parseInt(match[1]);
  const unit = match[2];
  const modifiers = { d: 'days', h: 'hours', m: 'minutes' };

  const deleted = db.prepare(`
    DELETE FROM clips WHERE pinned = 0 AND updated_at < datetime('now', ?)
  `).run(`-${num} ${modifiers[unit]}`);

  // Clean orphaned history
  db.prepare("DELETE FROM clip_history WHERE key NOT IN (SELECT key FROM clips)").run();

  console.log(`🗑️  Garbage collected ${deleted.changes} clip(s) older than ${olderThan}`);
};

commands.pin = function(args) {
  const key = args[0];
  if (!key) { console.error('Usage: clip pin <key>'); process.exit(1); }
  const result = db.prepare('UPDATE clips SET pinned = 1 WHERE key = ?').run(key);
  if (result.changes) console.log(`📌 Pinned "${key}"`);
  else console.error(`Key "${key}" not found.`);
};

commands.unpin = function(args) {
  const key = args[0];
  if (!key) { console.error('Usage: clip unpin <key>'); process.exit(1); }
  const result = db.prepare('UPDATE clips SET pinned = 0 WHERE key = ?').run(key);
  if (result.changes) console.log(`📌 Unpinned "${key}"`);
  else console.error(`Key "${key}" not found.`);
};

commands.share = function(args) {
  const key = args[0];
  if (!key) { console.error('Usage: clip share <key>'); process.exit(1); }

  const row = db.prepare('SELECT * FROM clips WHERE key = ?').get(key);
  if (!row) { console.error(`Key "${key}" not found.`); process.exit(1); }

  console.log(`📋 ${key} (${row.content_type}, ${humanSize(row.size)})`);
  if (row.tags) console.log(`🏷️  ${row.tags}`);
  console.log('─'.repeat(60));

  if (row.content_type === 'code' || row.content_type === 'json' || row.content_type === 'sql') {
    console.log('```');
    console.log(row.value);
    console.log('```');
  } else {
    console.log(row.value);
  }
};

commands.diff = function(args) {
  const [key1, key2] = args;
  if (!key1 || !key2) { console.error('Usage: clip diff <key1> <key2>'); process.exit(1); }

  const r1 = db.prepare('SELECT value FROM clips WHERE key = ?').get(key1);
  const r2 = db.prepare('SELECT value FROM clips WHERE key = ?').get(key2);
  if (!r1) { console.error(`Key "${key1}" not found.`); process.exit(1); }
  if (!r2) { console.error(`Key "${key2}" not found.`); process.exit(1); }

  const lines1 = r1.value.split('\n');
  const lines2 = r2.value.split('\n');

  console.log(`--- ${key1}`);
  console.log(`+++ ${key2}`);

  const maxLen = Math.max(lines1.length, lines2.length);
  for (let i = 0; i < maxLen; i++) {
    const l1 = lines1[i];
    const l2 = lines2[i];
    if (l1 === l2) {
      console.log(`  ${l1 || ''}`);
    } else {
      if (l1 !== undefined) console.log(`- ${l1}`);
      if (l2 !== undefined) console.log(`+ ${l2}`);
    }
  }
};

commands.history = function(args) {
  const key = args[0];
  if (!key) { console.error('Usage: clip history <key>'); process.exit(1); }

  const current = db.prepare('SELECT version, updated_at, value FROM clips WHERE key = ?').get(key);
  if (!current) { console.error(`Key "${key}" not found.`); process.exit(1); }

  const history = db.prepare(
    'SELECT version, changed_at, changed_by, value FROM clip_history WHERE key = ? ORDER BY version DESC'
  ).all(key);

  console.log(`📜 History for "${key}" (${history.length + 1} versions)`);
  console.log('─'.repeat(60));

  console.log(`  v${current.version} (current) — ${current.updated_at}`);
  console.log(`    ${truncate(current.value, 100)}`);

  for (const h of history) {
    const by = h.changed_by ? ` by ${h.changed_by}` : '';
    console.log(`  v${h.version} — ${h.changed_at}${by}`);
    console.log(`    ${truncate(h.value, 100)}`);
  }
};

commands.append = function(args) {
  const key = args[0];
  if (!key) { console.error('Usage: clip append <key> <value>'); process.exit(1); }

  let value = args.slice(1).join(' ');
  if (!value && !process.stdin.isTTY) value = readStdin();
  if (!value) { console.error('No value to append.'); process.exit(1); }

  const row = db.prepare('SELECT value, version FROM clips WHERE key = ?').get(key);
  if (!row) { console.error(`Key "${key}" not found. Use "set" to create.`); process.exit(1); }

  // Save history
  db.prepare('INSERT INTO clip_history (key, value, version) VALUES (?, ?, ?)').run(key, row.value, row.version);

  const newValue = row.value + '\n' + value;
  const newVersion = row.version + 1;

  db.prepare(`
    UPDATE clips SET value = ?, size = ?, hash = ?, updated_at = datetime('now'), version = ?
    WHERE key = ?
  `).run(newValue, Buffer.byteLength(newValue, 'utf8'), hashValue(newValue), newVersion, key);

  console.log(`✅ Appended to "${key}" (now ${humanSize(Buffer.byteLength(newValue, 'utf8'))}, v${newVersion})`);
};

// ==================== MAIN ====================

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Shared Clipboard — Cross-session key-value snippet store

Usage: clip <command> [args...]

Commands:
  set <key> <value>       Store a value (pipe stdin if no value)
  get <key>               Retrieve a value (raw output, pipeable)
  del <key>               Delete a key
  list [options]           List clips (--tag T, --search Q, --recent N)
  tags                    List all tags with counts
  push <value>            Push to anonymous stack
  pop                     Pop from stack
  peek                    View top of stack
  copy <from> <to>        Copy a clip to new key
  rename <old> <new>      Rename a key
  append <key> <value>    Append to existing clip
  share <key>             Pretty-print for sharing
  diff <key1> <key2>      Compare two clips
  history <key>           Show version history
  pin <key>               Protect from garbage collection
  unpin <key>             Remove pin
  export [--format F]     Export all clips (json|csv|md)
  import <file>           Import from JSON
  stats                   Usage statistics
  gc [--older-than 30d]   Clean old unpinned clips

Examples:
  clip set api-key "sk-abc123" --tag secrets
  clip get api-key
  echo "SELECT * FROM users" | clip set last-query --tag sql
  clip get last-query | sqlite3 mydb.db
  clip list --tag sql --search users
  clip push "quick note"
  clip pop
  clip export --format json > backup.json`);
  process.exit(0);
}

if (commands[cmd]) {
  commands[cmd](args);
} else {
  console.error(`Unknown command: "${cmd}". Run "clip --help" for usage.`);
  process.exit(1);
}
