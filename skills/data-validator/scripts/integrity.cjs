#!/usr/bin/env node
// integrity.cjs — Referential Integrity Checker
'use strict';
const fs = require('fs');

function parseCSV(text) {
  const lines = []; let current = '', inQuote = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) { if (c === '"' && text[i+1] === '"') { current += '"'; i++; } else if (c === '"') inQuote = false; else current += c; }
    else { if (c === '"') inQuote = true; else if (c === ',') { row.push(current); current = ''; } else if (c === '\n' || (c === '\r' && text[i+1] === '\n')) { if (c === '\r') i++; row.push(current); current = ''; if (row.length > 1 || row[0] !== '') lines.push(row); row = []; } else current += c; }
  }
  row.push(current); if (row.length > 1 || row[0] !== '') lines.push(row);
  if (!lines.length) return [];
  const headers = lines[0];
  return lines.slice(1).map(r => { const obj = {}; headers.forEach((h, i) => { obj[h.trim()] = r[i] !== undefined ? r[i].trim() : ''; }); return obj; });
}

function checkSQLiteIntegrity(dbPath) {
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true });
  const report = { foreignKeys: [], orphans: [], tables: {} };
  
  // Get tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  for (const t of tables) {
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${t}"`).get().c;
    report.tables[t] = { rows: count };
  }
  
  // Check FK violations
  db.pragma('foreign_keys = ON');
  try {
    const fkViolations = db.pragma('foreign_key_check');
    report.foreignKeys = fkViolations.slice(0, 50).map(v => ({
      table: v.table, rowid: v.rowid, parent: v.parent, fkid: v.fkid
    }));
  } catch(e) { report.foreignKeyError = e.message; }
  
  // Check for orphaned records via FK info
  for (const t of tables) {
    const fks = db.pragma(`foreign_key_list("${t}")`);
    for (const fk of fks) {
      try {
        const orphans = db.prepare(`SELECT COUNT(*) as c FROM "${t}" WHERE "${fk.from}" IS NOT NULL AND "${fk.from}" NOT IN (SELECT "${fk.to}" FROM "${fk.table}")`).get().c;
        if (orphans > 0) report.orphans.push({ table: t, column: fk.from, references: `${fk.table}.${fk.to}`, orphanCount: orphans });
      } catch(e) {}
    }
  }
  
  db.close();
  report.timestamp = new Date().toISOString();
  return report;
}

function checkFileIntegrity(sources, relationships) {
  // relationships: [{ from: { file, field }, to: { file, field } }]
  const report = { checks: [] };
  const cache = {};
  
  function load(file) {
    if (cache[file]) return cache[file];
    const content = fs.readFileSync(file, 'utf-8');
    cache[file] = file.endsWith('.csv') ? parseCSV(content) : JSON.parse(content);
    return cache[file];
  }
  
  for (const rel of relationships) {
    const fromData = load(rel.from.file);
    const toData = load(rel.to.file);
    const toValues = new Set(toData.map(r => String(r[rel.to.field])));
    const violations = [];
    for (let i = 0; i < fromData.length; i++) {
      const v = String(fromData[i][rel.from.field]);
      if (v && v !== '' && !toValues.has(v)) violations.push({ row: i + 1, value: v });
    }
    report.checks.push({
      from: `${rel.from.file}.${rel.from.field}`,
      to: `${rel.to.file}.${rel.to.field}`,
      violations: violations.length,
      samples: violations.slice(0, 10)
    });
  }
  report.timestamp = new Date().toISOString();
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node integrity.cjs <sqlite:path.db | --relationships FILE source1 source2 ...>'); process.exit(1); }
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  
  let result;
  if (args[0].startsWith('sqlite:')) {
    result = checkSQLiteIntegrity(args[0].replace('sqlite:', ''));
  } else if (args.includes('--relationships')) {
    const relFile = args[args.indexOf('--relationships') + 1];
    const rels = JSON.parse(fs.readFileSync(relFile, 'utf-8'));
    result = checkFileIntegrity([], rels);
  } else {
    console.error('Provide sqlite:path.db or --relationships FILE'); process.exit(1);
  }
  
  const json = JSON.stringify(result, null, 2);
  if (outputFile) fs.writeFileSync(outputFile, json);
  else console.log(json);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { checkSQLiteIntegrity, checkFileIntegrity };
