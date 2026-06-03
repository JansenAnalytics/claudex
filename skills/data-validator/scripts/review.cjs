#!/usr/bin/env node
// review.cjs — Full Data Validation Orchestrator
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCRIPTS = path.dirname(__filename || __dirname + '/scripts');

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

async function loadData(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) { return await (await fetch(source)).json(); }
  if (source.startsWith('sqlite:')) {
    const parts = source.replace('sqlite:', '').split(':');
    const Database = require('better-sqlite3');
    const db = new Database(parts[0], { readonly: true });
    const rows = db.prepare(`SELECT * FROM "${parts[1] || 'data'}"`).all(); db.close(); return rows;
  }
  const content = fs.readFileSync(source, 'utf-8');
  if (source.endsWith('.csv')) return parseCSV(content);
  if (source.endsWith('.jsonl') || source.endsWith('.ndjson')) return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  return JSON.parse(content);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, schema: null, infer: false, compare: null, relationships: null, timeseries: false, timeField: null, primaryKey: 'id', quick: false, full: false, outputDir: null, format: 'json', sample: 10 };
  
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--schema') opts.schema = args[++i];
    else if (a === '--infer') opts.infer = true;
    else if (a === '--compare') opts.compare = args[++i];
    else if (a === '--relationships') opts.relationships = args[++i];
    else if (a === '--timeseries') opts.timeseries = true;
    else if (a === '--time-field') opts.timeField = args[++i];
    else if (a === '--primary-key') opts.primaryKey = args[++i];
    else if (a === '--quick') opts.quick = true;
    else if (a === '--full') opts.full = true;
    else if (a === '--output-dir') opts.outputDir = args[++i];
    else if (a === '--format') opts.format = args[++i];
    else if (a === '--sample') opts.sample = parseInt(args[++i]);
    else if (!opts.source) opts.source = a;
  }
  return opts;
}

async function main() {
  const opts = parseArgs();
  if (!opts.source) { console.error('Usage: node review.cjs <source> [options]\n  --schema FILE    Schema to validate against\n  --infer          Auto-infer schema\n  --compare FILE2  Compare with another dataset\n  --timeseries     Run time-series analysis\n  --time-field N   Time field name\n  --primary-key N  Primary key field\n  --quick          Schema + quality only\n  --full           All checks\n  --output-dir DIR Output directory\n  --format md|json Output format\n  --sample N       Sample size for violations'); process.exit(1); }
  
  const scriptsDir = __dirname;
  const data = await loadData(opts.source);
  console.error(`Loaded ${data.length} records from ${opts.source}`);
  
  const results = {};
  
  // 1. Schema validation
  console.error('Running schema validation...');
  const schemaPath = path.join(scriptsDir, 'schema.cjs');
  const schemaArgs = [opts.source];
  if (opts.schema) schemaArgs.push('--schema', opts.schema);
  else schemaArgs.push('--infer');
  try {
    const out = execSync(`node "${schemaPath}" ${schemaArgs.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    results.schema = JSON.parse(out);
  } catch(e) { results.schema = { error: e.stderr || e.message }; }
  
  // 2. Quality checks
  if (!opts.quick || true) {
    console.error('Running quality checks...');
    const qualArgs = [opts.source];
    if (opts.timeField) qualArgs.push('--time-field', opts.timeField);
    try {
      const out = execSync(`node "${path.join(scriptsDir, 'quality.cjs')}" ${qualArgs.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      results.quality = JSON.parse(out);
    } catch(e) { results.quality = { error: e.stderr || e.message }; }
  }
  
  // 3. Compare
  if (opts.compare) {
    console.error('Running comparison...');
    const cmpArgs = [opts.source, opts.compare, '--primary-key', opts.primaryKey];
    try {
      const out = execSync(`node "${path.join(scriptsDir, 'compare.cjs')}" ${cmpArgs.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      results.comparison = JSON.parse(out);
    } catch(e) { results.comparison = { error: e.stderr || e.message }; }
  }
  
  // 4. Time series
  if (opts.timeseries || opts.full) {
    console.error('Running time-series analysis...');
    const tsArgs = [opts.source];
    if (opts.timeField) tsArgs.push('--time-field', opts.timeField);
    try {
      const out = execSync(`node "${path.join(scriptsDir, 'timeseries.cjs')}" ${tsArgs.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
      results.timeseries = JSON.parse(out);
    } catch(e) { results.timeseries = { error: e.stderr || e.message }; }
  }
  
  // 5. Generate report
  const { generateReport } = require('./report.cjs');
  const report = generateReport(results, { format: opts.format });
  
  // Output
  if (opts.outputDir) {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    if (results.schema) fs.writeFileSync(path.join(opts.outputDir, 'schema-validation.json'), JSON.stringify(results.schema, null, 2));
    if (results.quality) fs.writeFileSync(path.join(opts.outputDir, 'quality-report.json'), JSON.stringify(results.quality, null, 2));
    if (results.comparison) fs.writeFileSync(path.join(opts.outputDir, 'comparison-report.json'), JSON.stringify(results.comparison, null, 2));
    if (results.timeseries) fs.writeFileSync(path.join(opts.outputDir, 'timeseries-report.json'), JSON.stringify(results.timeseries, null, 2));
    const reportText = typeof report === 'string' ? report : JSON.stringify(report, null, 2);
    fs.writeFileSync(path.join(opts.outputDir, opts.format === 'md' ? 'report.md' : 'report.json'), reportText);
    console.error(`Reports written to ${opts.outputDir}/`);
  } else {
    console.log(typeof report === 'string' ? report : JSON.stringify(report, null, 2));
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
