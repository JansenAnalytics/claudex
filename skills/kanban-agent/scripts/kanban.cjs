#!/usr/bin/env node
/**
 * kanban.cjs — SQLite-backed task/project tracker.
 *
 * Usage:
 *   node kanban.cjs add "Task title" [options]
 *   node kanban.cjs list [--status todo,in-progress] [--priority p0,p1] [--tag work] [--project X]
 *   node kanban.cjs show <id>
 *   node kanban.cjs update <id> [options]
 *   node kanban.cjs move <id> <status>
 *   node kanban.cjs done <id> [--note "completion note"]
 *   node kanban.cjs block <id> --reason "why"
 *   node kanban.cjs unblock <id>
 *   node kanban.cjs delete <id>
 *   node kanban.cjs standup [--days 1]
 *   node kanban.cjs search "query"
 *   node kanban.cjs projects
 *   node kanban.cjs stats
 *   node kanban.cjs deps <id>         — show dependency tree
 *   node kanban.cjs overdue
 *   node kanban.cjs export [--format json|markdown]
 *
 * Env:
 *   KANBAN_DB (default: ~/.kanban/tasks.db)
 */

const Database = require('../node_modules/better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DB_PATH = process.env.KANBAN_DB || path.join(os.homedir(), '.kanban', 'tasks.db');
const STATUSES = ['backlog', 'todo', 'in-progress', 'review', 'done', 'blocked', 'cancelled'];
const PRIORITIES = ['p0', 'p1', 'p2', 'p3']; // p0 = critical, p3 = nice-to-have

// ── Database Setup ────────────────────────────────────────────────────────────
function getDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo' CHECK(status IN ('backlog','todo','in-progress','review','done','blocked','cancelled')),
      priority TEXT DEFAULT 'p2' CHECK(priority IN ('p0','p1','p2','p3')),
      project TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      deadline TEXT DEFAULT '',
      blocked_reason TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT '',
      created_by TEXT DEFAULT 'agent'
    );

    CREATE TABLE IF NOT EXISTS dependencies (
      task_id INTEGER NOT NULL,
      depends_on INTEGER NOT NULL,
      PRIMARY KEY (task_id, depends_on),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
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

function log(db, taskId, action, detail = '') {
  db.prepare('INSERT INTO task_log (task_id, action, detail) VALUES (?, ?, ?)').run(taskId, action, detail);
}

function priorityEmoji(p) {
  return { p0: '🔴', p1: '🟠', p2: '🟡', p3: '⚪' }[p] || '⚪';
}

function statusEmoji(s) {
  return { backlog: '📋', todo: '📌', 'in-progress': '🔧', review: '👀', done: '✅', blocked: '🚫', cancelled: '❌' }[s] || '❓';
}

function formatTask(t, compact = false) {
  const pe = priorityEmoji(t.priority);
  const se = statusEmoji(t.status);
  if (compact) {
    const deadline = t.deadline ? ` ⏰${t.deadline}` : '';
    const proj = t.project ? ` [${t.project}]` : '';
    const tags = t.tags ? ` {${t.tags}}` : '';
    const blocked = t.status === 'blocked' && t.blocked_reason ? ` — 🚫 ${t.blocked_reason}` : '';
    return `${pe} #${t.id} ${se} ${t.title}${proj}${tags}${deadline}${blocked}`;
  }
  const lines = [
    `${pe} #${t.id} — ${t.title}`,
    `  Status: ${se} ${t.status} | Priority: ${t.priority} | Project: ${t.project || '(none)'}`,
  ];
  if (t.description) lines.push(`  Description: ${t.description}`);
  if (t.tags) lines.push(`  Tags: ${t.tags}`);
  if (t.deadline) lines.push(`  Deadline: ⏰ ${t.deadline}`);
  if (t.status === 'blocked' && t.blocked_reason) lines.push(`  Blocked: 🚫 ${t.blocked_reason}`);
  if (t.notes) lines.push(`  Notes: ${t.notes}`);
  lines.push(`  Created: ${t.created_at} | Updated: ${t.updated_at}`);
  if (t.completed_at) lines.push(`  Completed: ${t.completed_at}`);
  return lines.join('\n');
}

// ── Commands ──────────────────────────────────────────────────────────────────
function cmdAdd(db, argv) {
  const { opts, positional } = parseArgs(argv);
  const title = positional.join(' ');
  if (!title) { console.error('Usage: kanban add "title" [--desc "..."] [--priority p0-p3] [--project X] [--tags "a,b"] [--deadline YYYY-MM-DD] [--depends 1,2]'); process.exit(1); }

  const stmt = db.prepare(`INSERT INTO tasks (title, description, status, priority, project, tags, deadline, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const result = stmt.run(
    title,
    opts.desc || opts.description || '',
    opts.status || 'todo',
    opts.priority || 'p2',
    opts.project || '',
    opts.tags || '',
    opts.deadline || '',
    opts.by || 'agent'
  );
  const id = result.lastInsertRowid;

  // Add dependencies
  if (opts.depends) {
    const depIds = opts.depends.split(',').map(d => parseInt(d.trim(), 10)).filter(Boolean);
    const depStmt = db.prepare('INSERT OR IGNORE INTO dependencies (task_id, depends_on) VALUES (?, ?)');
    for (const depId of depIds) depStmt.run(id, depId);
  }

  log(db, id, 'created', `"${title}" ${opts.priority || 'p2'} ${opts.project || ''}`);
  console.log(`✅ Created task #${id}: ${title}`);
}

function cmdList(db, argv) {
  const { opts } = parseArgs(argv);
  let where = [];
  let params = [];

  if (opts.status) {
    const statuses = opts.status.split(',');
    where.push(`status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  } else {
    // Default: exclude done and cancelled
    where.push("status NOT IN ('done', 'cancelled')");
  }
  if (opts.priority) {
    const prios = opts.priority.split(',');
    where.push(`priority IN (${prios.map(() => '?').join(',')})`);
    params.push(...prios);
  }
  if (opts.project) {
    where.push('project = ?');
    params.push(opts.project);
  }
  if (opts.tag) {
    where.push("tags LIKE ?");
    params.push(`%${opts.tag}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderBy = `ORDER BY
    CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 END,
    CASE status WHEN 'blocked' THEN 0 WHEN 'in-progress' THEN 1 WHEN 'todo' THEN 2 WHEN 'review' THEN 3 WHEN 'backlog' THEN 4 WHEN 'done' THEN 5 END,
    deadline ASC`;
  const limit = opts.limit ? `LIMIT ${parseInt(opts.limit, 10)}` : '';

  const tasks = db.prepare(`SELECT * FROM tasks ${whereClause} ${orderBy} ${limit}`).all(...params);

  if (tasks.length === 0) {
    console.log('No tasks found.');
    return;
  }

  // Group by status
  if (!opts.flat) {
    const grouped = {};
    for (const t of tasks) {
      if (!grouped[t.status]) grouped[t.status] = [];
      grouped[t.status].push(t);
    }
    for (const status of STATUSES) {
      if (!grouped[status]) continue;
      console.log(`\n${statusEmoji(status)} ${status.toUpperCase()} (${grouped[status].length})`);
      for (const t of grouped[status]) console.log('  ' + formatTask(t, true));
    }
  } else {
    for (const t of tasks) console.log(formatTask(t, true));
  }
  console.log(`\n${tasks.length} task(s) total`);
}

function cmdShow(db, argv) {
  const id = parseInt(argv[3], 10);
  if (!id) { console.error('Usage: kanban show <id>'); process.exit(1); }
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) { console.error(`Task #${id} not found.`); process.exit(1); }

  console.log(formatTask(task));

  // Show dependencies
  const deps = db.prepare('SELECT t.id, t.title, t.status FROM dependencies d JOIN tasks t ON t.id = d.depends_on WHERE d.task_id = ?').all(id);
  if (deps.length) {
    console.log('\n  Dependencies:');
    for (const d of deps) console.log(`    ${statusEmoji(d.status)} #${d.id} ${d.title} (${d.status})`);
  }

  // Show dependents (tasks that depend on this one)
  const dependents = db.prepare('SELECT t.id, t.title, t.status FROM dependencies d JOIN tasks t ON t.id = d.task_id WHERE d.depends_on = ?').all(id);
  if (dependents.length) {
    console.log('\n  Blocks:');
    for (const d of dependents) console.log(`    ${statusEmoji(d.status)} #${d.id} ${d.title} (${d.status})`);
  }

  // Show recent log
  const logs = db.prepare('SELECT * FROM task_log WHERE task_id = ? ORDER BY timestamp DESC LIMIT 10').all(id);
  if (logs.length) {
    console.log('\n  History:');
    for (const l of logs) console.log(`    ${l.timestamp} — ${l.action}: ${l.detail}`);
  }
}

function cmdUpdate(db, argv) {
  const id = parseInt(argv[3], 10);
  if (!id) { console.error('Usage: kanban update <id> [--title "..."] [--desc "..."] [--priority p0-p3] [--project X] [--tags "a,b"] [--deadline YYYY-MM-DD] [--note "..."]'); process.exit(1); }

  const { opts } = parseArgs(argv, 4);
  const updates = [];
  const params = [];

  for (const [key, col] of [['title', 'title'], ['desc', 'description'], ['description', 'description'],
    ['priority', 'priority'], ['project', 'project'], ['tags', 'tags'], ['deadline', 'deadline']]) {
    if (opts[key] !== undefined) {
      updates.push(`${col} = ?`);
      params.push(opts[key]);
    }
  }
  if (opts.note) {
    const task = db.prepare('SELECT notes FROM tasks WHERE id = ?').get(id);
    const newNotes = task.notes ? `${task.notes}\n[${new Date().toISOString().slice(0, 16)}] ${opts.note}` : `[${new Date().toISOString().slice(0, 16)}] ${opts.note}`;
    updates.push('notes = ?');
    params.push(newNotes);
  }

  if (updates.length === 0) { console.error('Nothing to update.'); process.exit(1); }
  updates.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  log(db, id, 'updated', Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(', '));
  console.log(`✅ Updated task #${id}`);
}

function cmdMove(db, argv) {
  const id = parseInt(argv[3], 10);
  const status = argv[4];
  if (!id || !status || !STATUSES.includes(status)) {
    console.error(`Usage: kanban move <id> <${STATUSES.join('|')}>`);
    process.exit(1);
  }

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) { console.error(`Task #${id} not found.`); process.exit(1); }

  const updates = { status, updated_at: "datetime('now')" };
  if (status === 'done') {
    db.prepare("UPDATE tasks SET status = ?, completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(status, id);
  } else {
    db.prepare("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  }

  log(db, id, 'moved', `${task.status} → ${status}`);
  console.log(`${statusEmoji(status)} Task #${id} moved to ${status}`);

  // Check if this unblocks any dependent tasks
  if (status === 'done') {
    const dependents = db.prepare(`
      SELECT d.task_id, t.title FROM dependencies d
      JOIN tasks t ON t.id = d.task_id
      WHERE d.depends_on = ? AND t.status NOT IN ('done', 'cancelled')
    `).all(id);
    for (const dep of dependents) {
      // Check if all deps are done
      const unmetDeps = db.prepare(`
        SELECT COUNT(*) as cnt FROM dependencies d
        JOIN tasks t ON t.id = d.depends_on
        WHERE d.task_id = ? AND t.status != 'done'
      `).get(dep.task_id);
      if (unmetDeps.cnt === 0) {
        console.log(`  🔓 Unblocked: #${dep.task_id} "${dep.title}" — all dependencies met`);
      }
    }
  }
}

function cmdDone(db, argv) {
  const id = parseInt(argv[3], 10);
  if (!id) { console.error('Usage: kanban done <id> [--note "..."]'); process.exit(1); }
  const { opts } = parseArgs(argv, 4);

  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!existing) { console.error(`Task #${id} not found.`); process.exit(1); }

  db.prepare("UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
  if (opts.note) {
    const task = db.prepare('SELECT notes FROM tasks WHERE id = ?').get(id);
    const newNotes = task.notes ? `${task.notes}\n[${new Date().toISOString().slice(0, 16)}] ✅ ${opts.note}` : `[${new Date().toISOString().slice(0, 16)}] ✅ ${opts.note}`;
    db.prepare('UPDATE tasks SET notes = ? WHERE id = ?').run(newNotes, id);
  }
  log(db, id, 'completed', opts.note || '');
  console.log(`✅ Task #${id} completed!`);
}

function cmdBlock(db, argv) {
  const id = parseInt(argv[3], 10);
  const { opts } = parseArgs(argv, 4);
  if (!id) { console.error('Usage: kanban block <id> --reason "why"'); process.exit(1); }

  db.prepare("UPDATE tasks SET status = 'blocked', blocked_reason = ?, updated_at = datetime('now') WHERE id = ?")
    .run(opts.reason || 'unspecified', id);
  log(db, id, 'blocked', opts.reason || 'unspecified');
  console.log(`🚫 Task #${id} blocked: ${opts.reason || 'unspecified'}`);
}

function cmdUnblock(db, argv) {
  const id = parseInt(argv[3], 10);
  if (!id) { console.error('Usage: kanban unblock <id>'); process.exit(1); }

  db.prepare("UPDATE tasks SET status = 'todo', blocked_reason = '', updated_at = datetime('now') WHERE id = ?").run(id);
  log(db, id, 'unblocked', '');
  console.log(`🔓 Task #${id} unblocked → todo`);
}

function cmdDelete(db, argv) {
  const id = parseInt(argv[3], 10);
  if (!id) { console.error('Usage: kanban delete <id>'); process.exit(1); }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  console.log(`🗑️ Task #${id} deleted`);
}

function cmdStandup(db, argv) {
  const { opts } = parseArgs(argv);
  const days = parseInt(opts.days || '1', 10);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);

  console.log(`📊 STANDUP REPORT (last ${days} day${days > 1 ? 's' : ''})`);
  console.log('═'.repeat(50));

  // Completed recently
  const completed = db.prepare("SELECT * FROM tasks WHERE status = 'done' AND completed_at >= ? ORDER BY completed_at DESC").all(since);
  console.log(`\n✅ COMPLETED (${completed.length})`);
  for (const t of completed) console.log(`  ${formatTask(t, true)}`);

  // In progress
  const inProgress = db.prepare("SELECT * FROM tasks WHERE status = 'in-progress' ORDER BY priority").all();
  console.log(`\n🔧 IN PROGRESS (${inProgress.length})`);
  for (const t of inProgress) console.log(`  ${formatTask(t, true)}`);

  // Blocked
  const blocked = db.prepare("SELECT * FROM tasks WHERE status = 'blocked' ORDER BY priority").all();
  if (blocked.length) {
    console.log(`\n🚫 BLOCKED (${blocked.length})`);
    for (const t of blocked) console.log(`  ${formatTask(t, true)}`);
  }

  // Overdue
  const today = new Date().toISOString().slice(0, 10);
  const overdue = db.prepare("SELECT * FROM tasks WHERE deadline != '' AND deadline < ? AND status NOT IN ('done', 'cancelled') ORDER BY deadline").all(today);
  if (overdue.length) {
    console.log(`\n⚠️ OVERDUE (${overdue.length})`);
    for (const t of overdue) console.log(`  ${formatTask(t, true)}`);
  }

  // Up next (top 5 todo by priority)
  const upNext = db.prepare("SELECT * FROM tasks WHERE status = 'todo' ORDER BY CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 END, deadline ASC LIMIT 5").all();
  console.log(`\n📌 UP NEXT`);
  for (const t of upNext) console.log(`  ${formatTask(t, true)}`);
}

function cmdSearch(db, argv) {
  const query = argv.slice(3).join(' ');
  if (!query) { console.error('Usage: kanban search "query"'); process.exit(1); }
  const tasks = db.prepare("SELECT * FROM tasks WHERE title LIKE ? OR description LIKE ? OR notes LIKE ? OR tags LIKE ? ORDER BY updated_at DESC")
    .all(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`);
  if (tasks.length === 0) { console.log('No matching tasks.'); return; }
  for (const t of tasks) console.log(formatTask(t, true));
  console.log(`\n${tasks.length} result(s)`);
}

function cmdProjects(db) {
  const projects = db.prepare(`
    SELECT project, COUNT(*) as total,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
    FROM tasks WHERE project != '' GROUP BY project ORDER BY active DESC, total DESC
  `).all();
  if (projects.length === 0) { console.log('No projects.'); return; }
  console.log('📁 PROJECTS\n');
  for (const p of projects) {
    const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`  ${p.project}: ${bar} ${pct}% (${p.done}/${p.total} done, ${p.active} active, ${p.blocked} blocked)`);
  }
}

function cmdStats(db) {
  const total = db.prepare('SELECT COUNT(*) as n FROM tasks').get().n;
  const byStatus = db.prepare('SELECT status, COUNT(*) as n FROM tasks GROUP BY status').all();
  const byPriority = db.prepare("SELECT priority, COUNT(*) as n FROM tasks WHERE status NOT IN ('done','cancelled') GROUP BY priority").all();
  const recentDone = db.prepare("SELECT COUNT(*) as n FROM tasks WHERE status = 'done' AND completed_at >= datetime('now', '-7 days')").get().n;

  console.log('📈 STATS\n');
  console.log(`  Total tasks: ${total}`);
  console.log(`  Completed this week: ${recentDone}`);
  console.log('\n  By status:');
  for (const s of byStatus) console.log(`    ${statusEmoji(s.status)} ${s.status}: ${s.n}`);
  console.log('\n  Active by priority:');
  for (const p of byPriority) console.log(`    ${priorityEmoji(p.priority)} ${p.priority}: ${p.n}`);
}

function cmdDeps(db, argv) {
  const id = parseInt(argv[3], 10);
  if (!id) { console.error('Usage: kanban deps <id>'); process.exit(1); }

  const visited = new Set();
  function printTree(taskId, indent = 0) {
    if (visited.has(taskId)) { console.log(`${'  '.repeat(indent)}⚠️ #${taskId} (circular dependency)`); return; }
    visited.add(taskId);
    const task = db.prepare('SELECT id, title, status FROM tasks WHERE id = ?').get(taskId);
    if (!task) return;
    console.log(`${'  '.repeat(indent)}${statusEmoji(task.status)} #${task.id} ${task.title}`);
    const deps = db.prepare('SELECT depends_on FROM dependencies WHERE task_id = ?').all(taskId);
    for (const d of deps) printTree(d.depends_on, indent + 1);
  }

  console.log(`Dependency tree for #${id}:\n`);
  printTree(id);
}

function cmdOverdue(db) {
  const today = new Date().toISOString().slice(0, 10);
  const tasks = db.prepare("SELECT * FROM tasks WHERE deadline != '' AND deadline < ? AND status NOT IN ('done', 'cancelled') ORDER BY deadline").all(today);
  if (tasks.length === 0) { console.log('No overdue tasks. 🎉'); return; }
  console.log(`⚠️ OVERDUE (${tasks.length})\n`);
  for (const t of tasks) console.log(formatTask(t, true));
}

function cmdExport(db, argv) {
  const { opts } = parseArgs(argv);
  const fmt = opts.format || 'json';
  const tasks = db.prepare('SELECT * FROM tasks ORDER BY id').all();

  if (fmt === 'json') {
    console.log(JSON.stringify(tasks, null, 2));
  } else {
    console.log('# Task Export\n');
    for (const t of tasks) {
      console.log(formatTask(t));
      console.log('');
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(`Usage: kanban <command> [args]

Commands:
  add "title" [--desc "..."] [--priority p0-p3] [--project X] [--tags "a,b"] [--deadline YYYY-MM-DD] [--depends 1,2] [--status STATUS]
  list [--status todo,in-progress] [--priority p0,p1] [--project X] [--tag work] [--flat] [--limit N]
  show <id>
  update <id> [--title "..."] [--desc "..."] [--priority p0-p3] [--project X] [--tags "a,b"] [--deadline YYYY-MM-DD] [--note "..."]
  move <id> <backlog|todo|in-progress|review|done|blocked|cancelled>
  done <id> [--note "completion note"]
  block <id> --reason "why"
  unblock <id>
  delete <id>
  standup [--days 1]
  search "query"
  projects
  stats
  deps <id>
  overdue
  export [--format json|markdown]`);
    process.exit(0);
  }

  const db = getDb();

  const commands = {
    add: cmdAdd, list: cmdList, show: cmdShow, update: cmdUpdate,
    move: cmdMove, done: cmdDone, block: cmdBlock, unblock: cmdUnblock,
    delete: cmdDelete, standup: cmdStandup, search: cmdSearch,
    projects: cmdProjects, stats: cmdStats, deps: cmdDeps,
    overdue: cmdOverdue, export: cmdExport,
  };

  if (!commands[cmd]) {
    console.error(`Unknown command: ${cmd}. Run 'kanban --help' for usage.`);
    process.exit(1);
  }

  commands[cmd](db, process.argv);
  db.close();
}

main();
