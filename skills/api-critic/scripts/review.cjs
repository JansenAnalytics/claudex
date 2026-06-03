#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let baseUrl = '';
let endpointsFile = '';
let authHeader = '';
let timeoutMs = '10000';
let quick = false;
let full = false;
let compareDir = '';
let outDir = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--endpoints' && args[i + 1]) endpointsFile = args[++i];
  else if (args[i] === '--auth' && args[i + 1]) authHeader = args[++i];
  else if (args[i] === '--timeout' && args[i + 1]) timeoutMs = args[++i];
  else if (args[i] === '--quick') quick = true;
  else if (args[i] === '--full') full = true;
  else if (args[i] === '--compare' && args[i + 1]) compareDir = args[++i];
  else if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i];
  else if (!args[i].startsWith('-')) baseUrl = args[i].replace(/\/+$/, '');
}

if (!baseUrl) {
  console.log(`
api-critic — Autonomous API testing and evaluation tool

Usage: node review.cjs <base-url> [options]

Options:
  --endpoints FILE   Manual route list (JSON array of {method, path, body?})
  --auth "Bearer x"  Authorization header for authenticated endpoints
  --timeout MS       Request timeout in milliseconds (default: 10000)
  --quick            Skip edge cases and slow tests
  --full             Run all tests including extended probes
  --compare DIR      Compare results with previous run in DIR
  --out-dir DIR      Output directory (default: /tmp/api-critic-<timestamp>)

Examples:
  node review.cjs http://localhost:3000
  node review.cjs https://api.example.com --auth "Bearer token123" --full
  node review.cjs http://localhost:3000 --compare /tmp/api-critic-previous
  `);
  process.exit(1);
}

if (!outDir) {
  outDir = `/tmp/api-critic-${Date.now()}`;
}
fs.mkdirSync(outDir, { recursive: true });

const scriptsDir = __dirname;

function run(cmd) {
  console.log(`\n${'='.repeat(60)}`);
  execSync(cmd, { stdio: 'inherit' });
}

console.log(`\n🔍 API Critic — Testing ${baseUrl}`);
console.log(`   Output: ${outDir}`);

// Step 1: Discover
let discoverCmd = `node "${path.join(scriptsDir, 'discover.cjs')}" "${baseUrl}" --out-dir "${outDir}"`;
if (endpointsFile) discoverCmd += ` --endpoints "${endpointsFile}"`;
run(discoverCmd);

// Step 2: Probe
let probeCmd = `node "${path.join(scriptsDir, 'probe.cjs')}" "${baseUrl}" --out-dir "${outDir}" --timeout ${timeoutMs}`;
if (authHeader) probeCmd += ` --auth "${authHeader}"`;
if (quick) probeCmd += ' --quick';
if (full) probeCmd += ' --full';
run(probeCmd);

// Step 3: Report
run(`node "${path.join(scriptsDir, 'report.cjs')}" --out-dir "${outDir}"`);

// Step 4: Compare (if requested)
if (compareDir) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Comparison with previous run\n');

  const prevPath = path.join(compareDir, 'api-critic-report.json');
  const currPath = path.join(outDir, 'api-critic-report.json');

  if (!fs.existsSync(prevPath)) {
    console.log(`  Previous report not found: ${prevPath}`);
  } else {
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    const curr = JSON.parse(fs.readFileSync(currPath, 'utf8'));

    console.log(`  Score: ${prev.score} → ${curr.score} (${curr.score >= prev.score ? '✅' : '⚠️'} ${curr.score - prev.score >= 0 ? '+' : ''}${curr.score - prev.score})`);

    const prevIssueKeys = new Set(prev.issues.map(i => `${i.endpoint}|${i.test}`));
    const currIssueKeys = new Set(curr.issues.map(i => `${i.endpoint}|${i.test}`));

    const fixed = prev.issues.filter(i => !currIssueKeys.has(`${i.endpoint}|${i.test}`));
    const newIssues = curr.issues.filter(i => !prevIssueKeys.has(`${i.endpoint}|${i.test}`));
    const remaining = curr.issues.filter(i => prevIssueKeys.has(`${i.endpoint}|${i.test}`));

    if (fixed.length) {
      console.log(`\n  ✅ Fixed (${fixed.length}):`);
      fixed.forEach(i => console.log(`    - ${i.endpoint} — ${i.test}`));
    }
    if (newIssues.length) {
      console.log(`\n  🆕 New issues (${newIssues.length}):`);
      newIssues.forEach(i => console.log(`    - [${i.severity}] ${i.endpoint} — ${i.test}`));
    }
    if (remaining.length) {
      console.log(`\n  ⏳ Remaining (${remaining.length}):`);
      remaining.forEach(i => console.log(`    - [${i.severity}] ${i.endpoint} — ${i.test}`));
    }
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`\n✅ Done! Reports saved to ${outDir}/`);
console.log(`   📄 api-critic-report.md`);
console.log(`   📊 api-critic-report.json`);
