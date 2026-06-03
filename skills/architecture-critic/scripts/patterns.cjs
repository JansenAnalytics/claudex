#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputFile = args.find((a,i) => args[i-1] === '--output') || 'patterns-report.json';

function getFiles(dir, exts) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      if (entry.isDirectory()) results.push(...getFiles(full, exts));
      else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
    }
  } catch(e) {}
  return results;
}

function analyzePatterns(absDir) {
  const files = getFiles(absDir, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
  const categories = {
    paradigm: { classes: [], functions: [] },
    exports: { default: [], named: [], cjs: [] },
    async: { callbacks: [], promises: [], asyncAwait: [] },
    errorHandling: { tryCatch: [], dotCatch: [], errorCallbacks: [] },
    imports: { require: [], esImport: [] },
    quotes: { single: 0, double: 0, template: 0 },
    semicolons: { with: 0, without: 0 },
    naming: { camelCase: 0, snake_case: 0, PascalCase: 0 }
  };

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const rel = path.relative(absDir, file);

    // Paradigm
    if (/\bclass\s+\w+/.test(content)) categories.paradigm.classes.push(rel);
    if (/(?:function\s+\w+|=>\s*{)/.test(content)) categories.paradigm.functions.push(rel);

    // Export style
    if (/export\s+default\b/.test(content)) categories.exports.default.push(rel);
    if (/export\s+(?:const|function|class|let|var)\b/.test(content) || /export\s*\{/.test(content)) categories.exports.named.push(rel);
    if (/module\.exports\b/.test(content)) categories.exports.cjs.push(rel);

    // Async
    if (/\basync\b/.test(content)) categories.async.asyncAwait.push(rel);
    if (/\.then\s*\(/.test(content)) categories.async.promises.push(rel);
    if (/function\s*\(\s*(?:err|error|e)\s*,/.test(content) || /\(\s*(?:err|error)\s*,/.test(content)) categories.async.callbacks.push(rel);

    // Error handling
    if (/\btry\s*\{/.test(content) || /\bcatch\s*\(/.test(content)) categories.errorHandling.tryCatch.push(rel);
    if (/\.catch\s*\(/.test(content)) categories.errorHandling.dotCatch.push(rel);

    // Imports
    if (/\brequire\s*\(/.test(content)) categories.imports.require.push(rel);
    if (/\bimport\s+/.test(content)) categories.imports.esImport.push(rel);

    // Quotes (sample lines, skip template expressions)
    for (const line of lines) {
      const singleMatches = (line.match(/'/g) || []).length;
      const doubleMatches = (line.match(/"/g) || []).length;
      if (singleMatches > doubleMatches) categories.quotes.single++;
      else if (doubleMatches > singleMatches) categories.quotes.double++;
    }

    // Semicolons
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      if (/[;]\s*$/.test(trimmed)) categories.semicolons.with++;
      else if (/[^{(,]\s*$/.test(trimmed) && trimmed.length > 5) categories.semicolons.without++;
    }

    // Naming: check function/variable names
    const names = [];
    let m;
    const nameRe = /(?:const|let|var|function)\s+(\w+)/g;
    while ((m = nameRe.exec(content))) names.push(m[1]);
    for (const name of names) {
      if (/^[a-z][a-zA-Z0-9]*$/.test(name) && /[A-Z]/.test(name)) categories.naming.camelCase++;
      else if (/^[a-z][a-z0-9_]*$/.test(name) && name.includes('_')) categories.naming.snake_case++;
      else if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) categories.naming.PascalCase++;
    }
  }

  // Determine dominant patterns
  function dominant(obj) {
    const entries = Object.entries(obj).map(([k, v]) => [k, Array.isArray(v) ? v.length : v]);
    entries.sort((a, b) => b[1] - a[1]);
    if (entries[0][1] === 0) return { dominant: 'none', distribution: Object.fromEntries(entries) };
    return { dominant: entries[0][0], distribution: Object.fromEntries(entries) };
  }

  const results = {};
  const inconsistencies = [];

  for (const [cat, data] of Object.entries(categories)) {
    results[cat] = dominant(data);
    const dist = results[cat].distribution;
    const values = Object.values(dist);
    const total = values.reduce((s, v) => s + v, 0);
    if (total > 0) {
      const max = Math.max(...values);
      if (max / total < 0.8 && values.filter(v => v > 0).length > 1) {
        const outliers = Object.entries(dist).filter(([k, v]) => v > 0 && k !== results[cat].dominant);
        inconsistencies.push({
          category: cat,
          dominant: results[cat].dominant,
          outliers: outliers.map(([k, v]) => ({ style: k, count: v })),
          severity: max / total < 0.5 ? 'high' : 'medium'
        });
      }
    }
  }

  // Directory structure analysis
  const dirs = new Set();
  for (const f of files) {
    const rel = path.relative(absDir, f);
    const parts = rel.split(path.sep);
    if (parts.length > 1) dirs.add(parts[0]);
  }
  results.directoryStructure = {
    topLevelDirs: [...dirs],
    type: dirs.size <= 1 ? 'flat' : (
      [...dirs].some(d => ['components', 'pages', 'views', 'features'].includes(d)) ? 'feature-based' :
      [...dirs].some(d => ['models', 'controllers', 'services', 'routes'].includes(d)) ? 'layer-based' : 'mixed'
    )
  };

  return { patterns: results, inconsistencies, fileCount: files.length };
}

function run() {
  const absDir = path.resolve(projectDir);
  const { patterns, inconsistencies, fileCount } = analyzePatterns(absDir);

  const report = {
    summary: { filesAnalyzed: fileCount, inconsistencies: inconsistencies.length },
    patterns,
    inconsistencies
  };

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  console.log(`\n🎨 Pattern Consistency: ${fileCount} files analyzed`);
  console.log(`   Inconsistencies found: ${inconsistencies.length}\n`);
  
  for (const [cat, data] of Object.entries(patterns)) {
    if (data.dominant) console.log(`   ${cat}: dominant=${data.dominant}`, data.distribution || '');
    else console.log(`   ${cat}:`, data);
  }
  
  if (inconsistencies.length) {
    console.log('\n   ⚠️ Inconsistencies:');
    for (const i of inconsistencies) {
      console.log(`     ${i.severity.toUpperCase()} ${i.category}: dominant=${i.dominant}, outliers: ${i.outliers.map(o => `${o.style}(${o.count})`).join(', ')}`);
    }
  }
  console.log(`\nReport: ${outputFile}`);
}

run();
