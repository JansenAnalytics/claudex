#!/usr/bin/env node
// quality.cjs — Data Quality Checks
'use strict';
const fs = require('fs');
const path = require('path');

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

function stats(nums) {
  if (!nums.length) return { mean: 0, std: 0, min: 0, max: 0 };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
  return { mean, std, min: Math.min(...nums), max: Math.max(...nums) };
}

function histogram(values, bins = 10) {
  const counts = {};
  for (const v of values) { const k = String(v); counts[k] = (counts[k] || 0) + 1; }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, bins).map(([value, count]) => ({ value, count }));
}

function checkQuality(data, opts = {}) {
  if (!data.length) return { score: 0, dimensions: {} };
  const keys = Object.keys(data[0]);
  const report = { completeness: {}, uniqueness: {}, consistency: {}, accuracy: {}, distribution: {} };
  const scores = {};
  
  // Completeness
  let totalCompleteness = 0;
  for (const key of keys) {
    const values = data.map(r => r[key]);
    const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
    const pct = ((values.length - nullCount) / values.length) * 100;
    const flagged = nullCount / values.length > 0.05;
    report.completeness[key] = { populated: pct.toFixed(1) + '%', nulls: nullCount, flagged };
    totalCompleteness += pct;
  }
  scores.completeness = totalCompleteness / keys.length;
  
  // Uniqueness
  let uniqueScore = 100;
  for (const key of keys) {
    const nonNull = data.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== '');
    const uniq = new Set(nonNull.map(String));
    const dupes = nonNull.length - uniq.size;
    const isLikelyUnique = uniq.size === nonNull.length;
    report.uniqueness[key] = { unique: uniq.size, duplicates: dupes, likelyUnique: isLikelyUnique };
    if (dupes > 0 && (key.toLowerCase().includes('id') || key.toLowerCase().includes('email'))) {
      uniqueScore -= 20;
      // Find duplicate samples
      const seen = {}, dupSamples = [];
      for (let i = 0; i < nonNull.length && dupSamples.length < 5; i++) {
        const k = String(nonNull[i]);
        if (seen[k]) dupSamples.push({ value: k, rows: [seen[k], i + 1] });
        else seen[k] = i + 1;
      }
      report.uniqueness[key].dupSamples = dupSamples;
    }
  }
  scores.uniqueness = Math.max(0, uniqueScore);
  
  // Consistency & Accuracy
  let consistencyScore = 100, accuracyScore = 100;
  for (const key of keys) {
    const values = data.map(r => r[key]).filter(v => v !== null && v !== undefined && v !== '');
    const nums = values.map(Number).filter(n => !isNaN(n));
    if (nums.length > 5) {
      const s = stats(nums);
      const outliers = nums.filter(n => Math.abs(n - s.mean) > 3 * s.std);
      report.accuracy[key] = { mean: s.mean.toFixed(2), std: s.std.toFixed(2), outliers: outliers.length, outlierSamples: outliers.slice(0, 5) };
      if (outliers.length > 0) accuracyScore -= Math.min(20, outliers.length * 2);
    }
    report.distribution[key] = histogram(values);
  }
  scores.consistency = Math.max(0, consistencyScore);
  scores.accuracy = Math.max(0, accuracyScore);
  
  // Cross-field rules
  const crossFieldIssues = [];
  if (opts.rules) {
    for (const rule of opts.rules) {
      let violations = 0;
      for (let i = 0; i < data.length; i++) {
        try { if (!eval(rule.expr.replace(/\$(\w+)/g, (_, f) => JSON.stringify(data[i][f])))) violations++; } catch(e) {}
      }
      crossFieldIssues.push({ rule: rule.name || rule.expr, violations });
    }
  }
  // Auto-detect common cross-field
  if (data[0].start_date && data[0].end_date) {
    let v = 0;
    for (const r of data) { if (r.start_date && r.end_date && new Date(r.start_date) > new Date(r.end_date)) v++; }
    crossFieldIssues.push({ rule: 'start_date < end_date', violations: v });
  }
  if (data[0].status && data[0].completed_at) {
    let v = 0;
    for (const r of data) { if (r.status === 'completed' && (!r.completed_at || r.completed_at === '')) v++; }
    crossFieldIssues.push({ rule: 'completed requires completed_at', violations: v });
  }
  
  report.crossField = crossFieldIssues;
  
  // Timeliness (if time field detected)
  const timeField = opts.timeField || keys.find(k => /date|time|created|updated/i.test(k));
  if (timeField) {
    const dates = data.map(r => r[timeField]).filter(v => v && !isNaN(Date.parse(v))).map(v => new Date(v)).sort((a, b) => a - b);
    if (dates.length > 1) {
      const gaps = [];
      for (let i = 1; i < dates.length; i++) {
        const diff = (dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24);
        if (diff > 2) gaps.push({ from: dates[i-1].toISOString().split('T')[0], to: dates[i].toISOString().split('T')[0], days: diff.toFixed(1) });
      }
      report.timeliness = { timeField, earliest: dates[0].toISOString(), latest: dates[dates.length-1].toISOString(), gaps: gaps.slice(0, 10) };
      scores.timeliness = gaps.length === 0 ? 100 : Math.max(0, 100 - gaps.length * 10);
    }
  }
  if (!scores.timeliness) scores.timeliness = 100;
  
  const overall = Object.values(scores).reduce((a, b) => a + b, 0) / Object.keys(scores).length;
  return { score: Math.round(overall), scores, report, recordCount: data.length, timestamp: new Date().toISOString() };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node quality.cjs <source> [--time-field name] [--rules FILE] [--output FILE]'); process.exit(1); }
  const source = args[0];
  const timeField = args.includes('--time-field') ? args[args.indexOf('--time-field') + 1] : null;
  const rulesFile = args.includes('--rules') ? args[args.indexOf('--rules') + 1] : null;
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  
  const data = await loadData(source);
  console.error(`Loaded ${data.length} records`);
  
  const rules = rulesFile ? JSON.parse(fs.readFileSync(rulesFile, 'utf-8')) : null;
  const result = checkQuality(data, { timeField, rules });
  
  const json = JSON.stringify(result, null, 2);
  if (outputFile) { fs.writeFileSync(outputFile, json); console.error(`Written to ${outputFile}`); }
  else console.log(json);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { checkQuality, loadData };
