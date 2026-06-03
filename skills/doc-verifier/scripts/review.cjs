#!/usr/bin/env node
'use strict';
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const quick = args.includes('--quick');
const full = args.includes('--full');
const noExecute = args.includes('--no-execute');
const apiUrl = args.find((a, i) => args[i - 1] === '--api-url') || '';
const cliCmd = args.find((a, i) => args[i - 1] === '--cli-cmd') || '';
const outputDir = args.find((a, i) => args[i - 1] === '--output-dir') || projectDir;
const format = args.find((a, i) => args[i - 1] === '--format') || 'md';
const compareDir = args.find((a, i) => args[i - 1] === '--compare') || '';

const scriptsDir = __dirname;
const dir = path.resolve(projectDir);
const outDir = path.resolve(outputDir);
fs.mkdirSync(outDir, { recursive: true });

function run(script, extraArgs = '') {
  const cmd = `node "${path.join(scriptsDir, script)}" "${dir}" --output-dir "${outDir}" ${extraArgs}`;
  try {
    const out = execSync(cmd, { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(out.toString());
  } catch (e) {
    console.error(`${script} failed: ${(e.stderr || e.message || '').toString().slice(0, 300)}`);
  }
}

console.log(`\n📚 Documentation Review: ${dir}\n${'='.repeat(50)}\n`);

if (quick) {
  console.log('Mode: Quick (links + freshness)\n');
  run('links.cjs');
  run('freshness.cjs');
} else {
  // Always run these
  run('links.cjs');
  run('freshness.cjs');
  run('completeness.cjs');

  if (full || !noExecute) {
    run('examples.cjs', noExecute ? '--no-execute' : '');
  }

  if (apiUrl) run('api-docs.cjs', `--api-url "${apiUrl}"`);
  if (cliCmd) run('cli-docs.cjs', `--cli-cmd "${cliCmd}"`);
}

// Generate report (report.cjs takes output dir as first positional arg)
{
  const cmd = `node "${path.join(scriptsDir, 'report.cjs')}" "${outDir}" --format ${format}`;
  try {
    const out = execSync(cmd, { timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    console.log(out.toString());
  } catch (e) {
    console.error(`report.cjs failed: ${(e.stderr || e.message || '').toString().slice(0, 300)}`);
  }
}

// Comparison
if (compareDir && fs.existsSync(compareDir)) {
  console.log(`\n📊 Comparison with ${compareDir}:`);
  try {
    const prev = JSON.parse(fs.readFileSync(path.join(compareDir, 'doc-health-report.json'), 'utf8'));
    const curr = JSON.parse(fs.readFileSync(path.join(outDir, 'doc-health-report.json'), 'utf8'));
    const diff = curr.healthScore - prev.healthScore;
    const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
    console.log(`${arrow} Health: ${prev.healthScore} → ${curr.healthScore} (${diff > 0 ? '+' : ''}${diff})`);
    console.log(`Issues: ${prev.totalIssues} → ${curr.totalIssues}`);
  } catch {
    console.log('(Could not load previous report for comparison)');
  }
}

console.log('\n✅ Review complete!');
