#!/usr/bin/env node
/**
 * Design Critic — Full Review Orchestrator
 *
 * One command to run the entire pipeline: capture → analyze → lighthouse → report.
 *
 * Usage:
 *   node review.cjs <url> [options]
 *   node review.cjs http://localhost:5173 --discover
 *   node review.cjs http://localhost:5173 --quick         # Skip lighthouse, minimal viewports
 *   node review.cjs http://localhost:5173 --full           # All viewports, all checks
 *   node review.cjs http://localhost:5173 --compare <prev-dir>  # Compare with previous review
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPTS_DIR = __dirname;

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf8',
      timeout: opts.timeout || 120000,
      cwd: SCRIPTS_DIR,
      stdio: opts.stdio || 'pipe',
      ...opts,
    });
  } catch (e) {
    return e.stdout || '';
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`Design Critic — Full Review

Usage: node review.cjs <url> [options]

Presets:
  --quick             Mobile + desktop only, skip lighthouse
  --full              All 9 viewports, lighthouse, discovery, dark mode comparison
  --responsive        Focus on responsive issues (all viewport sizes)

Options:
  --viewports LIST    Comma-separated viewport names
  --discover          Auto-discover linked pages
  --max-pages N       Max pages to discover (default: 10)
  --no-lighthouse     Skip lighthouse audit
  --dark-mode         Also capture dark mode
  --compare DIR       Compare with previous capture
  --output-dir DIR    Override output directory
  --vision            Generate vision analysis prompts for AI review`);
    process.exit(0);
  }

  const url = args.find(a => !a.startsWith('--'));
  if (!url) { console.error('❌ URL required'); process.exit(1); }

  const getFlag = (name) => args.includes(`--${name}`);
  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const isQuick = getFlag('quick');
  const isFull = getFlag('full');
  const isResponsive = getFlag('responsive');

  // Determine settings based on preset
  let viewports, skipLighthouse, discover;

  if (isQuick) {
    viewports = 'mobile,desktop';
    skipLighthouse = true;
    discover = false;
  } else if (isFull) {
    viewports = 'mobile-sm,mobile,mobile-lg,tablet,tablet-lg,desktop,desktop-lg,wide,ultrawide';
    skipLighthouse = false;
    discover = true;
  } else if (isResponsive) {
    viewports = 'mobile-sm,mobile,mobile-lg,tablet,tablet-lg,desktop,desktop-lg,wide';
    skipLighthouse = true;
    discover = false;
  } else {
    viewports = getArg('viewports') || 'mobile,tablet,desktop,wide';
    skipLighthouse = getFlag('no-lighthouse');
    discover = getFlag('discover');
  }

  const darkMode = getFlag('dark-mode') || isFull;
  const compareDir = getArg('compare');
  const includeVision = getFlag('vision') || isFull;
  const maxPages = getArg('max-pages') || '10';

  const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const slug = new URL(url).hostname.replace(/[.:]/g, '_');
  const outputDir = getArg('output-dir') || path.join(os.homedir(), '.design-critic', 'reviews', `${slug}_${timestamp}`);

  fs.mkdirSync(outputDir, { recursive: true });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                  🔍 DESIGN CRITIC REVIEW                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  URL: ${url}`);
  console.log(`  Viewports: ${viewports}`);
  console.log(`  Lighthouse: ${skipLighthouse ? 'skip' : 'yes'}`);
  console.log(`  Discovery: ${discover ? 'yes' : 'no'}`);
  console.log(`  Dark mode: ${darkMode ? 'yes' : 'no'}`);
  console.log(`  Output: ${outputDir}`);
  console.log();

  const startTime = Date.now();

  // ─── Step 1: Capture ───
  console.log('━'.repeat(60));
  console.log('📸 STEP 1: Multi-Viewport Capture');
  console.log('━'.repeat(60));

  const captureDir = path.join(outputDir, 'light');
  let captureArgs = `"${url}" --output-dir "${captureDir}" --viewports ${viewports}`;
  if (discover) captureArgs += ` --discover --max-pages ${maxPages}`;
  captureArgs += ' --no-links'; // Link check in capture is redundant with analyze

  const captureOutput = run(`node "${path.join(SCRIPTS_DIR, 'capture.cjs')}" ${captureArgs}`, {
    timeout: 300000,
    stdio: 'inherit',
  });

  // ─── Step 1b: Dark Mode Capture ───
  let darkCaptureDir = null;
  if (darkMode) {
    console.log('\n' + '━'.repeat(60));
    console.log('🌙 STEP 1b: Dark Mode Capture');
    console.log('━'.repeat(60));

    darkCaptureDir = path.join(outputDir, 'dark');
    const darkArgs = `"${url}" --output-dir "${darkCaptureDir}" --viewports ${viewports} --dark-mode --no-links`;
    run(`node "${path.join(SCRIPTS_DIR, 'capture.cjs')}" ${darkArgs}`, {
      timeout: 300000,
      stdio: 'inherit',
    });
  }

  // ─── Step 2: Analyze ───
  console.log('\n' + '━'.repeat(60));
  console.log('🔬 STEP 2: Issue Analysis');
  console.log('━'.repeat(60));

  const reportPath = path.join(outputDir, 'report.md');
  let analyzeArgs = `"${captureDir}" --format md --output "${reportPath}"`;
  if (includeVision) analyzeArgs += ' --vision';

  run(`node "${path.join(SCRIPTS_DIR, 'analyze.cjs')}" ${analyzeArgs}`, {
    stdio: 'inherit',
  });

  // Also generate JSON
  run(`node "${path.join(SCRIPTS_DIR, 'analyze.cjs')}" "${captureDir}" --format json --output "${path.join(outputDir, 'report.json')}"`);

  // ─── Step 3: Lighthouse ───
  let lighthouseResult = null;
  if (!skipLighthouse) {
    console.log('\n' + '━'.repeat(60));
    console.log('🏎️  STEP 3: Lighthouse Performance Audit');
    console.log('━'.repeat(60));

    run(`node "${path.join(SCRIPTS_DIR, 'lighthouse.cjs')}" "${url}" --output-dir "${path.join(outputDir, 'lighthouse')}"`, {
      timeout: 180000,
      stdio: 'inherit',
    });
  }

  // ─── Step 4: Comparison (if provided) ───
  if (compareDir) {
    console.log('\n' + '━'.repeat(60));
    console.log('📊 STEP 4: Comparison with Previous Review');
    console.log('━'.repeat(60));

    const prevIssuesPath = path.join(compareDir, 'light', 'issues.json');
    const currIssuesPath = path.join(captureDir, 'issues.json');

    if (fs.existsSync(prevIssuesPath) && fs.existsSync(currIssuesPath)) {
      const prevIssues = JSON.parse(fs.readFileSync(prevIssuesPath, 'utf8'));
      const currIssues = JSON.parse(fs.readFileSync(currIssuesPath, 'utf8'));

      const prevIds = new Set(prevIssues.map(i => i.id));
      const currIds = new Set(currIssues.map(i => i.id));

      const fixed = prevIssues.filter(i => !currIds.has(i.id));
      const newIssues = currIssues.filter(i => !prevIds.has(i.id));
      const remaining = currIssues.filter(i => prevIds.has(i.id));

      console.log(`  ✅ Fixed: ${fixed.length} issues`);
      for (const f of fixed) console.log(`     - ${f.emoji} ${f.title}`);

      console.log(`  🆕 New: ${newIssues.length} issues`);
      for (const n of newIssues) console.log(`     - ${n.emoji} ${n.title}`);

      console.log(`  ⏳ Remaining: ${remaining.length} issues`);

      // Save comparison
      const compPath = path.join(outputDir, 'comparison.json');
      fs.writeFileSync(compPath, JSON.stringify({ fixed, newIssues, remaining }, null, 2));
    } else {
      console.log('  ⚠️  Previous issues.json not found. Skipping comparison.');
    }
  }

  // ─── Final Summary ───
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log('📋 REVIEW COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  ⏱️  Time: ${elapsed}s`);
  console.log(`  📄 Report: ${reportPath}`);
  console.log(`  📁 Full output: ${outputDir}`);

  // Read and print issue counts from report
  if (fs.existsSync(path.join(outputDir, 'report.json'))) {
    const reportData = JSON.parse(fs.readFileSync(path.join(outputDir, 'report.json'), 'utf8'));
    const issues = JSON.parse(reportData);
    if (Array.isArray(issues)) {
      const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      for (const i of issues) counts[i.severity] = (counts[i.severity] || 0) + 1;
      console.log(`  🔴 Critical: ${counts.critical}`);
      console.log(`  🟠 High: ${counts.high}`);
      console.log(`  🟡 Medium: ${counts.medium}`);
      console.log(`  🔵 Low: ${counts.low}`);
    }
  }

  if (includeVision) {
    console.log(`\n  👁️ Vision prompts generated. Use with the image tool for AI visual review:`);
    console.log(`     cat "${captureDir}/vision-prompts.json" | jq '.[0].prompt'`);
  }

  console.log(`\n  Next steps:`);
  console.log(`  1. Read the report: cat "${reportPath}"`);
  console.log(`  2. Review screenshots: ls "${captureDir}/"*/`);
  if (includeVision) {
    console.log(`  3. AI visual review: Use image tool on screenshots with vision prompts`);
  }
  console.log(`  4. After fixes, re-run and compare: node review.cjs ${url} --compare "${outputDir}"`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
