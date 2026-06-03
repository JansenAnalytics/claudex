#!/usr/bin/env node
/**
 * kg.cjs — Knowledge Graph: SQLite-backed entity-relationship store.
 *
 * Entities: people, projects, decisions, tools, accounts, concepts, rules, events
 * Relations: decided-by, depends-on, related-to, supersedes, belongs-to, created-by, blocked-by, implements
 *
 * Usage:
 *   node kg.cjs add <type> "name" [--desc "..."] [--source "file:line"] [--date YYYY-MM-DD] [--tags "a,b"] [--meta key=value]
 *   node kg.cjs link <id|name> <relation> <id|name> [--note "why"] [--strength 0.0-1.0]
 *   node kg.cjs unlink <id|name> <relation> <id|name>
 *   node kg.cjs search "query" [--type decision] [--limit 20] [--related]
 *   node kg.cjs show <id|name> [--depth 2]
 *   node kg.cjs related <id|name> [--depth 2] [--type decision]
 *   node kg.cjs list [--type decision] [--tag rule] [--since 2026-03-01] [--limit 50]
 *   node kg.cjs update <id|name> [--name "..."] [--desc "..."] [--tags "..."] [--status active|superseded|archived]
 *   node kg.cjs merge <id|name> <id|name>  — merge two entities (keeps relations from both)
 *   node kg.cjs delete <id|name>
 *   node kg.cjs ingest <file.md> [--dry-run]  — extract entities from markdown
 *   node kg.cjs timeline [--type decision] [--project X] [--limit 30]
 *   node kg.cjs stats
 *   node kg.cjs export [--format json|dot|markdown]
 *   node kg.cjs path <id|name> <id|name>  — find shortest path between two entities
 *
 * Env:
 *   KG_DB (default: ~/.knowledge-graph/kg.db)
 */

const Database = require('../node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB_PATH = process.env.KG_DB || path.join(os.homedir(), '.knowledge-graph', 'kg.db');

const ENTITY_TYPES = [
  'person', 'project', 'decision', 'tool', 'account', 'concept', 'rule', 'event', 'skill', 'file', 'service'
];

const RELATION_TYPES = [
  'decided-by', 'depends-on', 'related-to', 'supersedes', 'belongs-to',
  'created-by', 'blocked-by', 'implements', 'uses', 'contradicts',
  'derived-from', 'part-of', 'triggers', 'configures', 'owns'
];

// ── Database ──────────────────────────────────────────────────────────────────
function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      source TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','superseded','archived','draft')),
      meta TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      event_date TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER NOT NULL,
      relation TEXT NOT NULL,
      to_id INTEGER NOT NULL,
      note TEXT DEFAULT '',
      strength REAL DEFAULT 1.0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (from_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (to_id) REFERENCES entities(id) ON DELETE CASCADE,
      UNIQUE(from_id, relation, to_id)
    );

    CREATE TABLE IF NOT EXISTS entity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_entities_tags ON entities(tags);
    CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
    CREATE INDEX IF NOT EXISTS idx_relations_from ON relations(from_id);
    CREATE INDEX IF NOT EXISTS idx_relations_to ON relations(to_id);
    CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation);

    CREATE VIRTUAL TABLE IF NOT EXISTS entities_fts USING fts5(
      name, description, tags, source,
      content='entities',
      content_rowid='id'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS entities_ai AFTER INSERT ON entities BEGIN
      INSERT INTO entities_fts(rowid, name, description, tags, source)
      VALUES (new.id, new.name, new.description, new.tags, new.source);
    END;

    CREATE TRIGGER IF NOT EXISTS entities_ad AFTER DELETE ON entities BEGIN
      INSERT INTO entities_fts(entities_fts, rowid, name, description, tags, source)
      VALUES ('delete', old.id, old.name, old.description, old.tags, old.source);
    END;

    CREATE TRIGGER IF NOT EXISTS entities_au AFTER UPDATE ON entities BEGIN
      INSERT INTO entities_fts(entities_fts, rowid, name, description, tags, source)
      VALUES ('delete', old.id, old.name, old.description, old.tags, old.source);
      INSERT INTO entities_fts(rowid, name, description, tags, source)
      VALUES (new.id, new.name, new.description, new.tags, new.source);
    END;
  `);

  return db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseArgs(argv, startIdx = 3) {
  const opts = {};
  const positional = [];
  for (let i = startIdx; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      opts[argv[i].slice(2)] = argv[++i];
    } else if (argv[i].startsWith('--')) {
      opts[argv[i].slice(2)] = true;
    } else {
      positional.push(argv[i]);
    }
  }
  return { opts, positional };
}

function resolveEntity(db, ref) {
  if (!ref) return null;
  // Try by ID first
  const byId = /^\d+$/.test(ref) ? db.prepare('SELECT * FROM entities WHERE id = ?').get(parseInt(ref, 10)) : null;
  if (byId) return byId;
  // Try exact name match
  const byName = db.prepare('SELECT * FROM entities WHERE name = ? COLLATE NOCASE').get(ref);
  if (byName) return byName;
  // Try partial name match
  const byPartial = db.prepare('SELECT * FROM entities WHERE name LIKE ? COLLATE NOCASE ORDER BY updated_at DESC LIMIT 1').get(`%${ref}%`);
  return byPartial || null;
}

function log(db, entityId, action, detail = '') {
  db.prepare('INSERT INTO entity_log (entity_id, action, detail) VALUES (?, ?, ?)').run(entityId, action, detail);
}

function typeEmoji(t) {
  return {
    person: '👤', project: '📁', decision: '⚖️', tool: '🔧', account: '💰',
    concept: '💡', rule: '📏', event: '📅', skill: '🎯', file: '📄', service: '⚙️'
  }[t] || '❓';
}

function statusBadge(s) {
  return { active: '🟢', superseded: '🔴', archived: '📦', draft: '✏️' }[s] || '';
}

function relationEmoji(r) {
  return {
    'decided-by': '👤→', 'depends-on': '🔗→', 'related-to': '↔️', 'supersedes': '🔄→',
    'belongs-to': '📂→', 'created-by': '✨→', 'blocked-by': '🚫→', 'implements': '⚡→',
    'uses': '🔧→', 'contradicts': '⚔️→', 'derived-from': '📜→', 'part-of': '🧩→',
    'triggers': '⚡→', 'configures': '⚙️→', 'owns': '🏠→'
  }[r] || '→';
}

function formatEntity(e, compact = false) {
  const te = typeEmoji(e.type);
  const sb = statusBadge(e.status);
  if (compact) {
    const tags = e.tags ? ` {${e.tags}}` : '';
    const date = e.event_date ? ` [${e.event_date}]` : '';
    return `${te} #${e.id} ${e.name}${tags}${date} ${sb}`;
  }
  const lines = [
    `${te} #${e.id} — ${e.name} ${sb}`,
    `  Type: ${e.type} | Status: ${e.status}`,
  ];
  if (e.description) lines.push(`  Description: ${e.description}`);
  if (e.tags) lines.push(`  Tags: ${e.tags}`);
  if (e.event_date) lines.push(`  Date: ${e.event_date}`);
  if (e.source) lines.push(`  Source: ${e.source}`);
  if (e.meta && e.meta !== '{}') {
    try {
      const m = JSON.parse(e.meta);
      if (Object.keys(m).length) lines.push(`  Meta: ${JSON.stringify(m)}`);
    } catch {}
  }
  lines.push(`  Created: ${e.created_at} | Updated: ${e.updated_at}`);
  return lines.join('\n');
}

function getRelations(db, entityId, direction = 'both') {
  const rels = [];
  if (direction === 'both' || direction === 'outgoing') {
    const outgoing = db.prepare(`
      SELECT r.*, e.name as target_name, e.type as target_type, e.status as target_status
      FROM relations r JOIN entities e ON e.id = r.to_id
      WHERE r.from_id = ?
    `).all(entityId);
    rels.push(...outgoing.map(r => ({ ...r, direction: 'outgoing' })));
  }
  if (direction === 'both' || direction === 'incoming') {
    const incoming = db.prepare(`
      SELECT r.*, e.name as target_name, e.type as target_type, e.status as target_status
      FROM relations r JOIN entities e ON e.id = r.from_id
      WHERE r.to_id = ?
    `).all(entityId);
    rels.push(...incoming.map(r => ({ ...r, direction: 'incoming' })));
  }
  return rels;
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdAdd(db, argv) {
  const type = argv[3];
  const { opts, positional } = parseArgs(argv, 4);
  const name = positional.join(' ');

  if (!type || !ENTITY_TYPES.includes(type)) {
    console.error(`Usage: kg add <${ENTITY_TYPES.join('|')}> "name" [--desc "..."] [--source "..."] [--date YYYY-MM-DD] [--tags "a,b"] [--meta key=value]`);
    process.exit(1);
  }
  if (!name) { console.error('Entity name required.'); process.exit(1); }

  // Check for duplicate
  const existing = db.prepare('SELECT id, name FROM entities WHERE name = ? COLLATE NOCASE AND type = ?').get(name, type);
  if (existing) {
    console.error(`⚠️ Entity already exists: #${existing.id} "${existing.name}" (${type}). Use 'update' to modify.`);
    process.exit(1);
  }

  // Parse meta from key=value pairs
  const meta = {};
  if (opts.meta) {
    opts.meta.split(',').forEach(kv => {
      const [k, ...v] = kv.split('=');
      if (k && v.length) meta[k.trim()] = v.join('=').trim();
    });
  }

  const result = db.prepare(`
    INSERT INTO entities (type, name, description, source, tags, meta, event_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    type, name,
    opts.desc || opts.description || '',
    opts.source || '',
    opts.tags || '',
    JSON.stringify(meta),
    opts.date || ''
  );

  const id = result.lastInsertRowid;
  log(db, id, 'created', `type=${type}`);
  console.log(`${typeEmoji(type)} Created ${type} #${id}: ${name}`);
}

function cmdLink(db, argv) {
  const { opts, positional } = parseArgs(argv, 3);
  if (positional.length < 3) {
    console.error(`Usage: kg link <entity> <${RELATION_TYPES.join('|')}> <entity> [--note "..."] [--strength 0.0-1.0]`);
    process.exit(1);
  }

  const fromRef = positional[0];
  const relation = positional[1];
  const toRef = positional.slice(2).join(' ');

  if (!RELATION_TYPES.includes(relation)) {
    console.error(`Unknown relation: ${relation}. Valid: ${RELATION_TYPES.join(', ')}`);
    process.exit(1);
  }

  const from = resolveEntity(db, fromRef);
  const to = resolveEntity(db, toRef);
  if (!from) { console.error(`Entity not found: ${fromRef}`); process.exit(1); }
  if (!to) { console.error(`Entity not found: ${toRef}`); process.exit(1); }

  try {
    db.prepare('INSERT INTO relations (from_id, relation, to_id, note, strength) VALUES (?, ?, ?, ?, ?)')
      .run(from.id, relation, to.id, opts.note || '', parseFloat(opts.strength || '1.0'));
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.error(`⚠️ Relation already exists: #${from.id} ${relation} #${to.id}`);
      process.exit(1);
    }
    throw e;
  }

  log(db, from.id, 'linked', `${relation} → #${to.id} "${to.name}"`);
  log(db, to.id, 'linked', `← ${relation} #${from.id} "${from.name}"`);

  // If supersedes, mark old entity as superseded
  if (relation === 'supersedes') {
    db.prepare("UPDATE entities SET status = 'superseded', updated_at = datetime('now') WHERE id = ?").run(to.id);
    console.log(`  🔴 #${to.id} "${to.name}" marked as superseded`);
  }

  console.log(`${relationEmoji(relation)} Linked: #${from.id} "${from.name}" —[${relation}]→ #${to.id} "${to.name}"`);
}

function cmdUnlink(db, argv) {
  const { positional } = parseArgs(argv, 3);
  if (positional.length < 3) {
    console.error('Usage: kg unlink <entity> <relation> <entity>');
    process.exit(1);
  }

  const from = resolveEntity(db, positional[0]);
  const relation = positional[1];
  const to = resolveEntity(db, positional.slice(2).join(' '));
  if (!from || !to) { console.error('Entity not found.'); process.exit(1); }

  const result = db.prepare('DELETE FROM relations WHERE from_id = ? AND relation = ? AND to_id = ?').run(from.id, relation, to.id);
  if (result.changes === 0) { console.error('Relation not found.'); process.exit(1); }
  console.log(`✂️ Unlinked: #${from.id} —[${relation}]→ #${to.id}`);
}

function cmdSearch(db, argv) {
  const { opts, positional } = parseArgs(argv, 3);
  const query = positional.join(' ');
  if (!query) { console.error('Usage: kg search "query" [--type decision] [--limit 20] [--related]'); process.exit(1); }

  const limit = parseInt(opts.limit || '20', 10);

  // FTS search
  let results;
  try {
    let sql = `
      SELECT e.*, rank
      FROM entities_fts fts
      JOIN entities e ON e.id = fts.rowid
      WHERE entities_fts MATCH ?
    `;
    const params = [query.split(/\s+/).map(w => `"${w}"`).join(' OR ')];

    if (opts.type) {
      sql += ' AND e.type = ?';
      params.push(opts.type);
    }

    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    results = db.prepare(sql).all(...params);
  } catch {
    // Fallback to LIKE search if FTS fails
    let sql = 'SELECT * FROM entities WHERE (name LIKE ? OR description LIKE ? OR tags LIKE ?)';
    const params = [`%${query}%`, `%${query}%`, `%${query}%`];
    if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
    sql += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(limit);
    results = db.prepare(sql).all(...params);
  }

  if (results.length === 0) { console.log('No results found.'); return; }

  console.log(`🔍 Search results for "${query}" (${results.length}):\n`);
  for (const e of results) {
    console.log(formatEntity(e, true));
    if (e.description) console.log(`   ${e.description.slice(0, 150)}${e.description.length > 150 ? '...' : ''}`);

    // Show related if requested
    if (opts.related) {
      const rels = getRelations(db, e.id);
      if (rels.length) {
        for (const r of rels.slice(0, 5)) {
          const arrow = r.direction === 'outgoing' ? '→' : '←';
          console.log(`   ${arrow} ${r.relation}: ${typeEmoji(r.target_type)} "${r.target_name}"`);
        }
        if (rels.length > 5) console.log(`   ... and ${rels.length - 5} more relations`);
      }
    }
    console.log('');
  }
}

function cmdShow(db, argv) {
  const { opts, positional } = parseArgs(argv, 3);
  const ref = positional.join(' ');
  if (!ref) { console.error('Usage: kg show <id|name> [--depth 2]'); process.exit(1); }

  const entity = resolveEntity(db, ref);
  if (!entity) { console.error(`Entity not found: ${ref}`); process.exit(1); }

  console.log(formatEntity(entity));

  // Show relations
  const rels = getRelations(db, entity.id);
  if (rels.length) {
    console.log('\n  Relations:');
    const outgoing = rels.filter(r => r.direction === 'outgoing');
    const incoming = rels.filter(r => r.direction === 'incoming');

    if (outgoing.length) {
      console.log('    Outgoing:');
      for (const r of outgoing) {
        const note = r.note ? ` (${r.note})` : '';
        console.log(`      ${relationEmoji(r.relation)} ${r.relation} → ${typeEmoji(r.target_type)} #${r.to_id} "${r.target_name}" [${r.target_status}]${note}`);
      }
    }
    if (incoming.length) {
      console.log('    Incoming:');
      for (const r of incoming) {
        const note = r.note ? ` (${r.note})` : '';
        console.log(`      ← ${r.relation} ${typeEmoji(r.target_type)} #${r.from_id} "${r.target_name}" [${r.target_status}]${note}`);
      }
    }
  }

  // Show depth-2 relations if requested
  const depth = parseInt(opts.depth || '1', 10);
  if (depth >= 2) {
    const seen = new Set([entity.id]);
    const secondLevel = [];
    for (const r of rels) {
      const targetId = r.direction === 'outgoing' ? r.to_id : r.from_id;
      if (seen.has(targetId)) continue;
      seen.add(targetId);
      const nextRels = getRelations(db, targetId);
      for (const nr of nextRels) {
        const nextTarget = nr.direction === 'outgoing' ? nr.to_id : nr.from_id;
        if (!seen.has(nextTarget)) {
          secondLevel.push({ via: r.target_name, viaRelation: r.relation, ...nr });
        }
      }
    }
    if (secondLevel.length) {
      console.log('\n    2nd-degree connections:');
      for (const r of secondLevel.slice(0, 10)) {
        console.log(`      via "${r.via}" (${r.viaRelation}) → ${r.relation} → ${typeEmoji(r.target_type)} "${r.target_name}"`);
      }
      if (secondLevel.length > 10) console.log(`      ... and ${secondLevel.length - 10} more`);
    }
  }

  // Show history
  const logs = db.prepare('SELECT * FROM entity_log WHERE entity_id = ? ORDER BY timestamp DESC LIMIT 10').all(entity.id);
  if (logs.length) {
    console.log('\n  History:');
    for (const l of logs) console.log(`    ${l.timestamp} — ${l.action}: ${l.detail}`);
  }
}

function cmdRelated(db, argv) {
  const { opts, positional } = parseArgs(argv, 3);
  const ref = positional.join(' ');
  if (!ref) { console.error('Usage: kg related <id|name> [--depth 2] [--type decision]'); process.exit(1); }

  const entity = resolveEntity(db, ref);
  if (!entity) { console.error(`Entity not found: ${ref}`); process.exit(1); }

  const depth = parseInt(opts.depth || '1', 10);
  const filterType = opts.type || null;

  console.log(`\n🕸️ Relations for: ${typeEmoji(entity.type)} #${entity.id} "${entity.name}"\n`);

  const visited = new Set([entity.id]);
  let currentLevel = [entity.id];

  for (let d = 1; d <= depth; d++) {
    const nextLevel = [];
    console.log(`  ${'─'.repeat(3)} Depth ${d} ${'─'.repeat(30)}`);

    for (const id of currentLevel) {
      const rels = getRelations(db, id);
      for (const r of rels) {
        const targetId = r.direction === 'outgoing' ? r.to_id : r.from_id;
        if (visited.has(targetId)) continue;
        visited.add(targetId);

        if (filterType && r.target_type !== filterType) continue;

        const arrow = r.direction === 'outgoing' ? '→' : '←';
        const note = r.note ? ` — ${r.note}` : '';
        console.log(`  ${arrow} ${r.relation}: ${typeEmoji(r.target_type)} #${targetId} "${r.target_name}" [${r.target_status}]${note}`);
        nextLevel.push(targetId);
      }
    }

    if (nextLevel.length === 0) { console.log('  (no more connections)'); break; }
    currentLevel = nextLevel;
  }
}

function cmdList(db, argv) {
  const { opts } = parseArgs(argv, 3);
  let sql = 'SELECT * FROM entities WHERE 1=1';
  const params = [];

  if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
  if (opts.tag) { sql += ' AND tags LIKE ?'; params.push(`%${opts.tag}%`); }
  if (opts.since) { sql += " AND (event_date >= ? OR created_at >= ?)"; params.push(opts.since, opts.since); }
  if (opts.status) { sql += ' AND status = ?'; params.push(opts.status); }
  if (!opts.status && !opts.all) { sql += " AND status != 'archived'"; }

  sql += ` ORDER BY
    CASE status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 WHEN 'superseded' THEN 2 WHEN 'archived' THEN 3 END,
    updated_at DESC`;
  sql += ` LIMIT ${parseInt(opts.limit || '50', 10)}`;

  const entities = db.prepare(sql).all(...params);
  if (entities.length === 0) { console.log('No entities found.'); return; }

  // Group by type
  const grouped = {};
  for (const e of entities) {
    if (!grouped[e.type]) grouped[e.type] = [];
    grouped[e.type].push(e);
  }

  for (const [type, items] of Object.entries(grouped)) {
    console.log(`\n${typeEmoji(type)} ${type.toUpperCase()} (${items.length})`);
    for (const e of items) {
      console.log(`  ${formatEntity(e, true)}`);
    }
  }
  console.log(`\n${entities.length} total`);
}

function cmdUpdate(db, argv) {
  const { opts, positional } = parseArgs(argv, 3);
  const ref = positional.join(' ');
  if (!ref) { console.error('Usage: kg update <id|name> [--name "..."] [--desc "..."] [--tags "..."] [--status active|superseded|archived]'); process.exit(1); }

  const entity = resolveEntity(db, ref);
  if (!entity) { console.error(`Entity not found: ${ref}`); process.exit(1); }

  const updates = [];
  const params = [];

  for (const [key, col] of [['name', 'name'], ['desc', 'description'], ['description', 'description'],
    ['tags', 'tags'], ['source', 'source'], ['status', 'status'], ['date', 'event_date']]) {
    if (opts[key] !== undefined) { updates.push(`${col} = ?`); params.push(opts[key]); }
  }

  if (updates.length === 0) { console.error('Nothing to update.'); process.exit(1); }
  updates.push("updated_at = datetime('now')");
  params.push(entity.id);

  db.prepare(`UPDATE entities SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  log(db, entity.id, 'updated', Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(', '));
  console.log(`✅ Updated #${entity.id} "${entity.name}"`);
}

function cmdMerge(db, argv) {
  const { positional } = parseArgs(argv, 3);
  if (positional.length < 2) { console.error('Usage: kg merge <keep> <absorb>'); process.exit(1); }

  const keep = resolveEntity(db, positional[0]);
  const absorb = resolveEntity(db, positional[1]);
  if (!keep) { console.error(`Entity not found: ${positional[0]}`); process.exit(1); }
  if (!absorb) { console.error(`Entity not found: ${positional[1]}`); process.exit(1); }

  // Move all relations from absorb to keep
  const absorbRels = getRelations(db, absorb.id);
  let moved = 0;
  for (const r of absorbRels) {
    try {
      if (r.direction === 'outgoing') {
        if (r.to_id !== keep.id) {
          db.prepare('INSERT OR IGNORE INTO relations (from_id, relation, to_id, note, strength) VALUES (?, ?, ?, ?, ?)')
            .run(keep.id, r.relation, r.to_id, r.note, r.strength);
          moved++;
        }
      } else {
        if (r.from_id !== keep.id) {
          db.prepare('INSERT OR IGNORE INTO relations (from_id, relation, to_id, note, strength) VALUES (?, ?, ?, ?, ?)')
            .run(r.from_id, r.relation, keep.id, r.note, r.strength);
          moved++;
        }
      }
    } catch {}
  }

  // Merge description if keep is empty
  if (!keep.description && absorb.description) {
    db.prepare('UPDATE entities SET description = ? WHERE id = ?').run(absorb.description, keep.id);
  }

  // Merge tags
  const keepTags = new Set(keep.tags.split(',').map(t => t.trim()).filter(Boolean));
  const absorbTags = absorb.tags.split(',').map(t => t.trim()).filter(Boolean);
  for (const t of absorbTags) keepTags.add(t);
  db.prepare('UPDATE entities SET tags = ? WHERE id = ?').run([...keepTags].join(','), keep.id);

  // Delete absorbed entity
  db.prepare('DELETE FROM entities WHERE id = ?').run(absorb.id);

  log(db, keep.id, 'merged', `absorbed #${absorb.id} "${absorb.name}", ${moved} relations moved`);
  console.log(`🔀 Merged #${absorb.id} "${absorb.name}" into #${keep.id} "${keep.name}" (${moved} relations moved)`);
}

function cmdDelete(db, argv) {
  const ref = argv.slice(3).join(' ');
  if (!ref) { console.error('Usage: kg delete <id|name>'); process.exit(1); }
  const entity = resolveEntity(db, ref);
  if (!entity) { console.error(`Entity not found: ${ref}`); process.exit(1); }
  db.prepare('DELETE FROM entities WHERE id = ?').run(entity.id);
  console.log(`🗑️ Deleted #${entity.id} "${entity.name}"`);
}

function cmdTimeline(db, argv) {
  const { opts } = parseArgs(argv, 3);
  let sql = "SELECT * FROM entities WHERE event_date != ''";
  const params = [];

  if (opts.type) { sql += ' AND type = ?'; params.push(opts.type); }
  if (opts.project) {
    const proj = resolveEntity(db, opts.project);
    if (proj) {
      sql += ` AND id IN (SELECT from_id FROM relations WHERE to_id = ? UNION SELECT to_id FROM relations WHERE from_id = ?)`;
      params.push(proj.id, proj.id);
    }
  }

  sql += ` ORDER BY event_date DESC LIMIT ${parseInt(opts.limit || '30', 10)}`;
  const entities = db.prepare(sql).all(...params);

  if (entities.length === 0) { console.log('No dated entities found.'); return; }

  console.log('📅 TIMELINE\n');
  let lastDate = '';
  for (const e of entities) {
    if (e.event_date !== lastDate) {
      console.log(`  ${e.event_date}`);
      lastDate = e.event_date;
    }
    console.log(`    ${formatEntity(e, true)}`);
    if (e.description) console.log(`      ${e.description.slice(0, 120)}${e.description.length > 120 ? '...' : ''}`);
  }
}

function cmdPath(db, argv) {
  const { positional } = parseArgs(argv, 3);
  if (positional.length < 2) { console.error('Usage: kg path <entity1> <entity2>'); process.exit(1); }

  const start = resolveEntity(db, positional[0]);
  const end = resolveEntity(db, positional.slice(1).join(' '));
  if (!start) { console.error(`Entity not found: ${positional[0]}`); process.exit(1); }
  if (!end) { console.error(`Entity not found: ${positional.slice(1).join(' ')}`); process.exit(1); }

  // BFS for shortest path
  const queue = [[start.id]];
  const visited = new Set([start.id]);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current === end.id) {
      // Found path — print it
      console.log(`\n🛤️ Path from "${start.name}" to "${end.name}" (${path.length - 1} hops):\n`);
      for (let i = 0; i < path.length; i++) {
        const e = db.prepare('SELECT * FROM entities WHERE id = ?').get(path[i]);
        console.log(`  ${i === 0 ? '🏁' : i === path.length - 1 ? '🎯' : '  '} ${formatEntity(e, true)}`);
        if (i < path.length - 1) {
          const rel = db.prepare('SELECT relation, note FROM relations WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)')
            .get(path[i], path[i + 1], path[i + 1], path[i]);
          if (rel) console.log(`     ↕ ${rel.relation}${rel.note ? ` (${rel.note})` : ''}`);
        }
      }
      return;
    }

    const rels = getRelations(db, current);
    for (const r of rels) {
      const targetId = r.direction === 'outgoing' ? r.to_id : r.from_id;
      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push([...path, targetId]);
      }
    }
  }

  console.log(`No path found between "${start.name}" and "${end.name}".`);
}

function cmdIngest(db, argv) {
  const { opts, positional } = parseArgs(argv, 3);
  const filePath = positional.join(' ');
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Usage: kg ingest <file.md> [--dry-run]');
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const dryRun = opts['dry-run'] || opts.dryRun || false;
  const basename = path.basename(filePath);
  const extracted = [];

  // Extract ## headings as potential entities
  const headingRegex = /^##\s+(.+?)(?:\s*\((\d{4}-\d{2}-\d{2}).*?\))?\s*$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const title = match[1].trim();
    const date = match[2] || '';
    const headingPos = match.index;

    // Get content until next heading
    const nextHeading = content.indexOf('\n## ', headingPos + 1);
    const sectionContent = content.slice(headingPos, nextHeading > 0 ? nextHeading : undefined).trim();

    // Classify entity type
    let type = 'concept';
    const lower = title.toLowerCase();
    if (lower.includes('decision') || lower.includes('rule') || lower.includes('design')) type = 'decision';
    else if (lower.includes('project') || lower.includes('sprint') || lower.includes('phase')) type = 'project';
    else if (lower.includes('tool') || lower.includes('install') || lower.includes('setup')) type = 'tool';
    else if (lower.includes('lesson') || lower.includes('learned') || lower.includes('fix')) type = 'rule';
    else if (lower.includes('event') || lower.includes('meeting') || lower.includes('session')) type = 'event';
    else if (lower.includes('account') || lower.includes('api') || lower.includes('key')) type = 'account';

    // Extract a one-line description from first non-heading line
    const descLines = sectionContent.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('-'));
    const desc = descLines.length > 0 ? descLines[0].replace(/^\*\*.*?\*\*:?\s*/, '').trim().slice(0, 300) : '';

    extracted.push({ type, name: title, desc, date, source: `${basename}:${content.slice(0, headingPos).split('\n').length}` });
  }

  if (extracted.length === 0) {
    console.log('No entities extracted.');
    return;
  }

  console.log(`📥 Extracted ${extracted.length} entities from ${basename}${dryRun ? ' (DRY RUN)' : ''}:\n`);
  for (const e of extracted) {
    const existing = db.prepare('SELECT id FROM entities WHERE name = ? COLLATE NOCASE').get(e.name);
    const status = existing ? '⏭️ exists' : '✅ new';
    console.log(`  ${typeEmoji(e.type)} [${e.type}] ${e.name} ${e.date ? `(${e.date})` : ''} — ${status}`);
    if (e.desc) console.log(`    ${e.desc.slice(0, 100)}`);

    if (!dryRun && !existing) {
      const result = db.prepare('INSERT INTO entities (type, name, description, source, event_date) VALUES (?, ?, ?, ?, ?)')
        .run(e.type, e.name, e.desc, e.source, e.date);
      log(db, result.lastInsertRowid, 'ingested', `from ${basename}`);
    }
  }

  if (!dryRun) {
    const newCount = extracted.filter(e => !db.prepare('SELECT id FROM entities WHERE name = ? COLLATE NOCASE AND id != (SELECT MAX(id) FROM entities)').get(e.name)).length;
    console.log(`\n${extracted.length} processed.`);
  }
}

function cmdStats(db) {
  const total = db.prepare('SELECT COUNT(*) as n FROM entities').get().n;
  const totalRels = db.prepare('SELECT COUNT(*) as n FROM relations').get().n;
  const byType = db.prepare('SELECT type, COUNT(*) as n FROM entities GROUP BY type ORDER BY n DESC').all();
  const byStatus = db.prepare('SELECT status, COUNT(*) as n FROM entities GROUP BY status').all();
  const byRelation = db.prepare('SELECT relation, COUNT(*) as n FROM relations GROUP BY relation ORDER BY n DESC').all();
  const recentlyUpdated = db.prepare("SELECT * FROM entities ORDER BY updated_at DESC LIMIT 5").all();
  const mostConnected = db.prepare(`
    SELECT e.id, e.name, e.type,
      (SELECT COUNT(*) FROM relations WHERE from_id = e.id) +
      (SELECT COUNT(*) FROM relations WHERE to_id = e.id) as connections
    FROM entities e ORDER BY connections DESC LIMIT 5
  `).all();

  console.log('📊 KNOWLEDGE GRAPH STATS\n');
  console.log(`  Entities: ${total}`);
  console.log(`  Relations: ${totalRels}`);

  console.log('\n  By type:');
  for (const t of byType) console.log(`    ${typeEmoji(t.type)} ${t.type}: ${t.n}`);

  console.log('\n  By status:');
  for (const s of byStatus) console.log(`    ${statusBadge(s.status)} ${s.status}: ${s.n}`);

  if (byRelation.length) {
    console.log('\n  Relations:');
    for (const r of byRelation) console.log(`    ${r.relation}: ${r.n}`);
  }

  if (mostConnected.length && mostConnected[0].connections > 0) {
    console.log('\n  Most connected:');
    for (const e of mostConnected.filter(e => e.connections > 0)) {
      console.log(`    ${typeEmoji(e.type)} #${e.id} "${e.name}" — ${e.connections} connections`);
    }
  }

  if (recentlyUpdated.length) {
    console.log('\n  Recently updated:');
    for (const e of recentlyUpdated) console.log(`    ${formatEntity(e, true)}`);
  }
}

function cmdExport(db, argv) {
  const { opts } = parseArgs(argv, 3);
  const fmt = opts.format || 'json';
  const entities = db.prepare('SELECT * FROM entities ORDER BY type, name').all();
  const relations = db.prepare('SELECT * FROM relations').all();

  if (fmt === 'json') {
    console.log(JSON.stringify({ entities, relations }, null, 2));
  } else if (fmt === 'dot') {
    // GraphViz DOT format
    const lines = ['digraph KG {', '  rankdir=LR;', '  node [shape=box, style=rounded];'];
    for (const e of entities) {
      const color = { active: 'green', superseded: 'red', archived: 'gray', draft: 'yellow' }[e.status] || 'black';
      lines.push(`  e${e.id} [label="${e.name}\\n(${e.type})" color=${color}];`);
    }
    for (const r of relations) {
      lines.push(`  e${r.from_id} -> e${r.to_id} [label="${r.relation}"];`);
    }
    lines.push('}');
    console.log(lines.join('\n'));
  } else {
    console.log('# Knowledge Graph Export\n');
    for (const e of entities) {
      console.log(formatEntity(e));
      const rels = relations.filter(r => r.from_id === e.id);
      for (const r of rels) {
        const target = entities.find(t => t.id === r.to_id);
        console.log(`  → ${r.relation}: ${target ? target.name : `#${r.to_id}`}`);
      }
      console.log('');
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`Usage: kg <command> [args]

Commands:
  add <type> "name" [--desc "..."] [--source "file:line"] [--date YYYY-MM-DD] [--tags "a,b"]
      Types: ${ENTITY_TYPES.join(', ')}
  link <entity> <relation> <entity> [--note "..."] [--strength 0.0-1.0]
      Relations: ${RELATION_TYPES.join(', ')}
  unlink <entity> <relation> <entity>
  search "query" [--type decision] [--limit 20] [--related]
  show <id|name> [--depth 2]
  related <id|name> [--depth 2] [--type decision]
  list [--type decision] [--tag rule] [--since 2026-03-01] [--limit 50] [--all]
  update <id|name> [--name "..."] [--desc "..."] [--tags "..."] [--status active|superseded|archived]
  merge <keep> <absorb>
  delete <id|name>
  ingest <file.md> [--dry-run]
  timeline [--type decision] [--project X] [--limit 30]
  path <entity1> <entity2>
  stats
  export [--format json|dot|markdown]

Database: ${DB_PATH}`);
    process.exit(0);
  }

  const db = getDb();
  const commands = {
    add: cmdAdd, link: cmdLink, unlink: cmdUnlink, search: cmdSearch,
    show: cmdShow, related: cmdRelated, list: cmdList, update: cmdUpdate,
    merge: cmdMerge, delete: cmdDelete, ingest: cmdIngest, timeline: cmdTimeline,
    path: cmdPath, stats: cmdStats, export: cmdExport,
  };

  if (!commands[cmd]) { console.error(`Unknown command: ${cmd}. Run 'kg --help' for usage.`); process.exit(1); }
  commands[cmd](db, process.argv);
  db.close();
}

main();
