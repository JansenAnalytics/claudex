#!/usr/bin/env node
// timeseries.cjs — Time Series Specific Validation
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

async function loadData(source) {
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

function analyzeTimeSeries(data, opts = {}) {
  const timeField = opts.timeField || Object.keys(data[0]).find(k => /date|time|created|timestamp/i.test(k));
  if (!timeField) return { error: 'No time field detected. Use --time-field to specify.' };
  
  const report = { timeField, totalRecords: data.length };
  
  // Parse and sort timestamps
  const entries = data
    .map((r, i) => ({ idx: i, raw: r[timeField], ts: Date.parse(r[timeField]) }))
    .filter(e => !isNaN(e.ts))
    .sort((a, b) => a.ts - b.ts);
  
  report.validTimestamps = entries.length;
  report.invalidTimestamps = data.length - entries.length;
  if (entries.length < 2) return { ...report, error: 'Not enough valid timestamps for analysis' };
  
  report.range = { from: new Date(entries[0].ts).toISOString(), to: new Date(entries[entries.length - 1].ts).toISOString() };
  
  // Duplicate timestamps
  const tsCounts = {};
  for (const e of entries) { tsCounts[e.ts] = (tsCounts[e.ts] || 0) + 1; }
  const dupes = Object.entries(tsCounts).filter(([_, c]) => c > 1);
  report.duplicateTimestamps = { count: dupes.length, samples: dupes.slice(0, 10).map(([ts, c]) => ({ timestamp: new Date(Number(ts)).toISOString(), occurrences: c })) };
  
  // Gap detection
  const intervals = [];
  for (let i = 1; i < entries.length; i++) intervals.push(entries[i].ts - entries[i - 1].ts);
  const medianInterval = intervals.slice().sort((a, b) => a - b)[Math.floor(intervals.length / 2)];
  const gaps = [];
  for (let i = 1; i < entries.length; i++) {
    const gap = entries[i].ts - entries[i - 1].ts;
    if (gap > medianInterval * 3) {
      gaps.push({ from: new Date(entries[i - 1].ts).toISOString(), to: new Date(entries[i].ts).toISOString(), gapMs: gap, expectedMs: medianInterval, factor: (gap / medianInterval).toFixed(1) });
    }
  }
  report.gaps = { medianIntervalMs: medianInterval, medianIntervalHuman: humanInterval(medianInterval), count: gaps.length, details: gaps.slice(0, 20) };
  
  // Monotonicity
  let increasing = 0, decreasing = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].ts > entries[i - 1].ts) increasing++;
    else if (entries[i].ts < entries[i - 1].ts) decreasing++;
  }
  report.monotonicity = { increasing, decreasing, isMonotonic: decreasing === 0 };
  
  // Anomaly detection (z-score on numeric fields)
  const numericFields = Object.keys(data[0]).filter(k => {
    const vals = data.slice(0, 100).map(r => Number(r[k])).filter(n => !isNaN(n));
    return vals.length > 50;
  });
  
  report.anomalies = {};
  for (const field of numericFields.slice(0, 5)) {
    const vals = data.map(r => Number(r[field])).filter(n => !isNaN(n));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
    if (std === 0) continue;
    const anomalies = [];
    for (let i = 0; i < vals.length; i++) {
      const z = Math.abs(vals[i] - mean) / std;
      if (z > 3) anomalies.push({ index: i, value: vals[i], zScore: z.toFixed(2) });
    }
    if (anomalies.length) report.anomalies[field] = { mean: mean.toFixed(2), std: std.toFixed(2), anomalyCount: anomalies.length, samples: anomalies.slice(0, 10) };
  }
  
  // Stale data detection
  const lastTs = entries[entries.length - 1].ts;
  const staleDays = (Date.now() - lastTs) / (1000 * 60 * 60 * 24);
  report.staleness = { lastRecord: new Date(lastTs).toISOString(), daysSinceLastRecord: staleDays.toFixed(1), isStale: staleDays > 7 };
  
  report.timestamp = new Date().toISOString();
  return report;
}

function humanInterval(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(0) + 's';
  if (ms < 3600000) return (ms / 60000).toFixed(0) + 'min';
  if (ms < 86400000) return (ms / 3600000).toFixed(1) + 'h';
  return (ms / 86400000).toFixed(1) + 'd';
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node timeseries.cjs <source> [--time-field name] [--output FILE]'); process.exit(1); }
  const source = args[0];
  const timeField = args.includes('--time-field') ? args[args.indexOf('--time-field') + 1] : null;
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  
  const data = await loadData(source);
  console.error(`Loaded ${data.length} records`);
  const result = analyzeTimeSeries(data, { timeField });
  
  const json = JSON.stringify(result, null, 2);
  if (outputFile) fs.writeFileSync(outputFile, json);
  else console.log(json);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { analyzeTimeSeries };
