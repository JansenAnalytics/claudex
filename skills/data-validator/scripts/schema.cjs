#!/usr/bin/env node
// schema.cjs — Schema Validation for CSV, JSON, NDJSON, SQLite, API endpoints
'use strict';
const fs = require('fs');
const path = require('path');

// --- CSV Parser (handles quoted fields, headers) ---
function parseCSV(text) {
  const lines = [];
  let current = '', inQuote = false, row = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') inQuote = false;
      else current += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',') { row.push(current); current = ''; }
      else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
        if (c === '\r') i++;
        row.push(current); current = '';
        if (row.length > 1 || row[0] !== '') lines.push(row);
        row = [];
      } else current += c;
    }
  }
  row.push(current);
  if (row.length > 1 || row[0] !== '') lines.push(row);
  if (!lines.length) return [];
  const headers = lines[0];
  return lines.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = r[i] !== undefined ? r[i].trim() : ''; });
    return obj;
  });
}

// --- Data Loading ---
async function loadData(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const resp = await fetch(source);
    return await resp.json();
  }
  if (source.startsWith('sqlite:')) {
    const parts = source.replace('sqlite:', '').split(':');
    const dbPath = parts[0], table = parts[1] || 'data';
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    db.close();
    return rows;
  }
  const content = fs.readFileSync(source, 'utf-8');
  if (source.endsWith('.csv')) return parseCSV(content);
  if (source.endsWith('.jsonl') || source.endsWith('.ndjson')) {
    return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
  }
  return JSON.parse(content);
}

// --- Type Detection ---
function detectType(values) {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (!nonNull.length) return { type: 'string' };
  
  const isInt = v => /^-?\d+$/.test(String(v));
  const isNum = v => !isNaN(Number(v)) && String(v).trim() !== '';
  const isDate = v => !isNaN(Date.parse(String(v))) && /\d{4}/.test(String(v));
  const isBool = v => ['true', 'false', '0', '1'].includes(String(v).toLowerCase());
  
  const sample = nonNull.slice(0, 1000);
  if (sample.every(v => Array.isArray(v))) return { type: 'array' };
  if (sample.every(v => isBool(v))) return { type: 'boolean' };
  if (sample.every(v => isInt(v))) {
    const nums = sample.map(Number);
    return { type: 'integer', min: Math.min(...nums), max: Math.max(...nums) };
  }
  if (sample.every(v => isNum(v))) {
    const nums = sample.map(Number);
    return { type: 'number', min: Math.min(...nums), max: Math.max(...nums) };
  }
  if (sample.length > 5 && sample.filter(v => isDate(v)).length / sample.length > 0.8) {
    return { type: 'date', format: 'ISO8601' };
  }
  // Check enum
  const unique = new Set(sample.map(String));
  if (unique.size <= 20 && unique.size < sample.length * 0.3) {
    return { type: 'enum', values: [...unique] };
  }
  // Check pattern (email)
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (sample.filter(v => emailRe.test(String(v))).length / sample.length > 0.8) {
    return { type: 'string', pattern: '^[^@]+@[^@]+$' };
  }
  return { type: 'string' };
}

function inferSchema(data) {
  if (!data.length) return { fields: {} };
  const fields = {};
  const keys = Object.keys(data[0]);
  for (const key of keys) {
    const values = data.map(r => r[key]);
    const info = detectType(values);
    const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
    info.required = nonNull.length === values.length;
    // Check uniqueness
    const uniqSet = new Set(nonNull.map(String));
    if (uniqSet.size === nonNull.length && nonNull.length > 1) info.unique = true;
    fields[key] = info;
  }
  return { fields };
}

// --- Validation ---
function validate(data, schema) {
  const results = {};
  const fieldNames = Object.keys(schema.fields);
  
  for (const fname of fieldNames) {
    const spec = schema.fields[fname];
    const violations = [];
    const seen = new Set();
    let nullCount = 0;
    
    for (let i = 0; i < data.length; i++) {
      const val = data[i][fname];
      const isEmpty = val === null || val === undefined || val === '';
      
      if (isEmpty) {
        nullCount++;
        if (spec.required) violations.push({ row: i + 1, issue: 'missing_required', value: val });
        continue;
      }
      
      const strVal = String(val);
      
      // Type checks
      if (spec.type === 'integer') {
        if (!/^-?\d+$/.test(strVal)) { violations.push({ row: i + 1, issue: 'not_integer', value: val }); continue; }
        const n = Number(val);
        if (spec.min !== undefined && n < spec.min) violations.push({ row: i + 1, issue: 'below_min', value: val, min: spec.min });
        if (spec.max !== undefined && n > spec.max) violations.push({ row: i + 1, issue: 'above_max', value: val, max: spec.max });
      } else if (spec.type === 'number') {
        if (isNaN(Number(val))) { violations.push({ row: i + 1, issue: 'not_number', value: val }); continue; }
        const n = Number(val);
        if (spec.min !== undefined && n < spec.min) violations.push({ row: i + 1, issue: 'below_min', value: val });
        if (spec.max !== undefined && n > spec.max) violations.push({ row: i + 1, issue: 'above_max', value: val });
      } else if (spec.type === 'enum') {
        if (!spec.values.includes(strVal)) violations.push({ row: i + 1, issue: 'invalid_enum', value: val, allowed: spec.values });
      } else if (spec.type === 'date') {
        if (isNaN(Date.parse(strVal))) { violations.push({ row: i + 1, issue: 'invalid_date', value: val }); }
        else {
          if (spec.after && new Date(strVal) < new Date(spec.after)) violations.push({ row: i + 1, issue: 'date_before_min', value: val, after: spec.after });
          if (spec.before && new Date(strVal) > new Date(spec.before)) violations.push({ row: i + 1, issue: 'date_after_max', value: val });
        }
      } else if (spec.type === 'array') {
        let arr = val;
        if (typeof val === 'string') try { arr = JSON.parse(val); } catch(e) { violations.push({ row: i + 1, issue: 'not_array', value: val }); continue; }
        if (!Array.isArray(arr)) { violations.push({ row: i + 1, issue: 'not_array', value: val }); continue; }
        if (spec.minLength && arr.length < spec.minLength) violations.push({ row: i + 1, issue: 'array_too_short', value: val });
      } else if (spec.type === 'boolean') {
        if (!['true', 'false', '0', '1'].includes(strVal.toLowerCase())) violations.push({ row: i + 1, issue: 'not_boolean', value: val });
      }
      
      // Pattern
      if (spec.pattern) {
        const re = new RegExp(spec.pattern);
        if (!re.test(strVal)) violations.push({ row: i + 1, issue: 'pattern_mismatch', value: val, pattern: spec.pattern });
      }
      
      // Uniqueness
      if (spec.unique) {
        if (seen.has(strVal)) violations.push({ row: i + 1, issue: 'duplicate', value: val });
        seen.add(strVal);
      }
    }
    
    results[fname] = {
      total: data.length,
      nulls: nullCount,
      violations: violations.length,
      pass: violations.length === 0,
      samples: violations.slice(0, 10)
    };
  }
  return results;
}

// --- Main ---
async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node schema.cjs <source> [--schema FILE] [--infer] [--output FILE]'); process.exit(1); }
  
  const source = args[0];
  const schemaFile = args.includes('--schema') ? args[args.indexOf('--schema') + 1] : null;
  const doInfer = args.includes('--infer');
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  
  const data = await loadData(source);
  console.error(`Loaded ${data.length} records from ${source}`);
  
  let schema;
  if (schemaFile) {
    schema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
  } else if (doInfer) {
    schema = inferSchema(data);
    console.error('Inferred schema:');
    console.error(JSON.stringify(schema, null, 2));
  } else {
    schema = inferSchema(data);
  }
  
  const results = validate(data, schema);
  const output = { source, recordCount: data.length, schema, validation: results, timestamp: new Date().toISOString() };
  
  const json = JSON.stringify(output, null, 2);
  if (outputFile) { fs.writeFileSync(outputFile, json); console.error(`Written to ${outputFile}`); }
  else console.log(json);
}

main().catch(e => { console.error(e.message); process.exit(1); });
