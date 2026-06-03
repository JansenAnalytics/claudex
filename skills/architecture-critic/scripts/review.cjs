#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const isQuick = args.includes('--quick');
const isFull = args.includes('--full') || !isQuick;
const format = args.find((a,i) => args[i-1] === '--format') || 'json';
const outputDir = args.find((a,i) => args[i-1] === '--output-dir') || '.';
const maxComplexity = args.find((a,i) => args[i-1] === '--max-complexity') || '10';
const ignoreArgs = [];
args.forEach((a,i) => { if (args[i-1] === '--ignore') ignoreArgs.push('--ignore', a); });

const scriptsDir = __dirname;

function runAnalyzer(script, extraArgs = []) {
  const cmd = `node "${path.join(scriptsDir, script)}" "${projectDir}" --output "${path.join(outputDir, script.replace('.cjs', '-report.json'))}" ${extraArgs.join(' ')}`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
    console.log(out);
    return true;
  } catch(e) {
    console.error(`   ❌ ${script} failed: ${e.message}`);
    return false;
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  🏗️  Architecture Review: ${path.resolve(projectDir)}`);
console.log(`  Mode: ${isQuick ? 'quick' : 'full'}`);
console.log(`${'='.repeat(60)}`);

const analyzers = [
  { script: 'complexity.cjs', args: ['--max-complexity', maxComplexity, ...ignoreArgs], quick: true },
  { script: 'deadcode.cjs', args: ignoreArgs, quick: true },
  { script: 'deps.cjs', args: ignoreArgs, quick: false },
  { script: 'patterns.cjs', args: ignoreArgs, quick: false },
  { script: 'errors.cjs', args: ignoreArgs, quick: false },
  { script: 'duplication.cjs', args: ignoreArgs, quick: false },
];

const results = {};
for (const a of analyzers) {
  if (isQuick && !a.quick) continue;
  console.log(`\n${'─'.repeat(40)}`);
  results[a.script] = runAnalyzer(a.script, a.args);
}

// Generate combined report
console.log(`\n${'─'.repeat(40)}`);
const reportScript = path.join(scriptsDir, 'report.cjs');
const reportArgs = [
  outputDir,
  '--format', format,
  '--output', path.join(outputDir, `architecture-review.${format === 'md' ? 'md' : 'json'}`)
];
try {
  const out = execSync(`node "${reportScript}" ${reportArgs.map(a => `"${a}"`).join(' ')}`, { encoding: 'utf8', timeout: 30000 });
  console.log(out);
} catch(e) {
  console.error('Report generation failed:', e.message);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Review complete. Reports in: ${path.resolve(outputDir)}`);
console.log(`${'='.repeat(60)}\n`);
