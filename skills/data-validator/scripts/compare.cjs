#!/usr/bin/env node
// compare.cjs — Data Diff & Drift Detection
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

function compare(dataA, dataB, opts = {}) {
  const pk = opts.primaryKey || 'id';
  const tolerance = opts.tolerance || 0.001;
  const report = {};
  
  report.rowCount = { before: dataA.length, after: dataB.length, change: dataB.length - dataA.length };
  
  const colsA = dataA.length ? Object.keys(dataA[0]) : [];
  const colsB = dataB.length ? Object.keys(dataB[0]) : [];
  report.columns = { before: colsA.length, after: colsB.length, added: colsB.filter(c => !colsA.includes(c)), removed: colsA.filter(c => !colsB.includes(c)) };
  
  // Index by PK
  const indexA = {}, indexB = {};
  for (const r of dataA) indexA[String(r[pk])] = r;
  for (const r of dataB) indexB[String(r[pk])] = r;
  
  const keysA = new Set(Object.keys(indexA));
  const keysB = new Set(Object.keys(indexB));
  report.records = {
    added: [...keysB].filter(k => !keysA.has(k)).slice(0, 20),
    removed: [...keysA].filter(k => !keysB.has(k)).slice(0, 20),
    addedCount: [...keysB].filter(k => !keysA.has(k)).length,
    removedCount: [...keysA].filter(k => !keysB.has(k)).length
  };
  
  // Value changes
  const commonKeys = [...keysA].filter(k => keysB.has(k));
  const commonCols = colsA.filter(c => colsB.includes(c));
  const changes = [];
  for (const k of commonKeys.slice(0, 10000)) {
    const a = indexA[k], b = indexB[k];
    for (const col of commonCols) {
      const va = a[col], vb = b[col];
      if (String(va) !== String(vb)) {
        const na = Number(va), nb = Number(vb);
        if (!isNaN(na) && !isNaN(nb) && Math.abs(na - nb) < tolerance) continue;
        if (changes.length < 50) changes.push({ key: k, field: col, before: va, after: vb });
      }
    }
  }
  report.valueChanges = { count: changes.length, samples: changes.slice(0, 20) };
  
  // Distribution shifts
  report.distributionShifts = {};
  for (const col of commonCols) {
    const numsA = dataA.map(r => Number(r[col])).filter(n => !isNaN(n));
    const numsB = dataB.map(r => Number(r[col])).filter(n => !isNaN(n));
    if (numsA.length > 5 && numsB.length > 5) {
      const meanA = numsA.reduce((a, b) => a + b, 0) / numsA.length;
      const meanB = numsB.reduce((a, b) => a + b, 0) / numsB.length;
      const shift = meanA !== 0 ? Math.abs(meanB - meanA) / Math.abs(meanA) * 100 : 0;
      if (shift > 20) report.distributionShifts[col] = { meanBefore: meanA.toFixed(2), meanAfter: meanB.toFixed(2), shiftPct: shift.toFixed(1) + '%' };
    }
    // New enum values
    const uniqA = new Set(dataA.map(r => String(r[col])));
    const uniqB = new Set(dataB.map(r => String(r[col])));
    if (uniqA.size <= 20) {
      const newVals = [...uniqB].filter(v => !uniqA.has(v));
      if (newVals.length > 0 && newVals.length <= 10) {
        if (!report.distributionShifts[col]) report.distributionShifts[col] = {};
        report.distributionShifts[col].newValues = newVals;
      }
    }
  }
  
  report.timestamp = new Date().toISOString();
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) { console.error('Usage: node compare.cjs <source1> <source2> [--primary-key name] [--tolerance N] [--output FILE]'); process.exit(1); }
  const pk = args.includes('--primary-key') ? args[args.indexOf('--primary-key') + 1] : 'id';
  const tol = args.includes('--tolerance') ? Number(args[args.indexOf('--tolerance') + 1]) : 0.001;
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  
  const [dataA, dataB] = await Promise.all([loadData(args[0]), loadData(args[1])]);
  console.error(`Comparing ${dataA.length} vs ${dataB.length} records`);
  const result = compare(dataA, dataB, { primaryKey: pk, tolerance: tol });
  
  const json = JSON.stringify(result, null, 2);
  if (outputFile) fs.writeFileSync(outputFile, json);
  else console.log(json);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { compare, loadData };
