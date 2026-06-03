#!/usr/bin/env node
/**
 * Switch the SQLite MCP server to a different database file.
 * Usage: node switch-db.cjs <path-to-db>
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.env.HOME, '.mcporter', 'mcporter.json');
const dbPath = process.argv[2];

if (!dbPath) {
  console.error('Usage: node switch-db.cjs <path-to-db>');
  console.error('');
  console.error('Available DBs:');
  console.error('  ~/.kanban/tasks.db         — Kanban task tracker');
  console.error('  ~/.meta-analyst/events.db   — Meta-analyst events');
  console.error('  ~/.knowledge-graph/kg.db    — Knowledge graph');
  process.exit(1);
}

const resolvedPath = path.resolve(dbPath.replace(/^~/, process.env.HOME));

if (!fs.existsSync(resolvedPath)) {
  console.error(`Database not found: ${resolvedPath}`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

if (!config.mcpServers?.sqlite) {
  console.error('No sqlite server configured in mcporter.json');
  process.exit(1);
}

config.mcpServers.sqlite.args = ['--db-path', resolvedPath];
fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');

console.log(`✅ SQLite MCP server switched to: ${resolvedPath}`);
