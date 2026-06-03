#!/usr/bin/env node
/**
 * Design Critic — Lighthouse Performance Audit
 *
 * Runs Lighthouse and extracts key metrics + opportunities.
 *
 * Usage:
 *   node lighthouse.cjs <url> [--output-dir DIR] [--categories performance,accessibility,best-practices,seo]
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function runLighthouse(url, options = {}) {
  const {
    outputDir = path.join(os.homedir(), '.design-critic', 'lighthouse'),
    categories = ['performance', 'accessibility', 'best-practices', 'seo'],
  } = options;

  fs.mkdirSync(outputDir, { recursive: true });

  const slug = new URL(url).hostname.replace(/\./g, '_');
  const timestamp = Date.now();
  const jsonPath = path.join(outputDir, `${slug}_${timestamp}.json`);
  const htmlPath = path.join(outputDir, `${slug}_${timestamp}.html`);

  const catFlags = categories.map(c => `--only-categories=${c}`).join(' ');

  console.log(`🏎️  Running Lighthouse on ${url}...`);
  console.log(`   Categories: ${categories.join(', ')}\n`);

  try {
    execSync(
      `lighthouse "${url}" ${catFlags} --chrome-flags="--headless --no-sandbox --disable-gpu --disable-dev-shm-usage" ` +
      `--output=json,html --output-path="${path.join(outputDir, `${slug}_${timestamp}`)}" --quiet`,
      { encoding: 'utf8', timeout: 120000, stdio: 'pipe' }
    );
  } catch (e) {
    // Lighthouse often exits with code 1 but still produces output
    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ Lighthouse failed: ${e.message?.slice(0, 200)}`);
      return null;
    }
  }

  if (!fs.existsSync(jsonPath)) {
    console.error('❌ No Lighthouse output generated.');
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // Extract key scores
  const scores = {};
  for (const [key, cat] of Object.entries(raw.categories || {})) {
    scores[key] = Math.round(cat.score * 100);
  }

  // Core Web Vitals
  const audits = raw.audits || {};
  const cwv = {
    FCP: audits['first-contentful-paint']?.displayValue || '?',
    LCP: audits['largest-contentful-paint']?.displayValue || '?',
    TBT: audits['total-blocking-time']?.displayValue || '?',
    CLS: audits['cumulative-layout-shift']?.displayValue || '?',
    SI: audits['speed-index']?.displayValue || '?',
    TTI: audits['interactive']?.displayValue || '?',
  };

  // Top opportunities (things to fix)
  const opportunities = [];
  for (const [id, audit] of Object.entries(audits)) {
    if (audit.details?.type === 'opportunity' && audit.score !== null && audit.score < 1) {
      opportunities.push({
        id,
        title: audit.title,
        score: audit.score,
        savings: audit.details?.overallSavingsMs
          ? `${Math.round(audit.details.overallSavingsMs)}ms`
          : audit.details?.overallSavingsBytes
          ? `${Math.round(audit.details.overallSavingsBytes / 1024)}KB`
          : '?',
        description: audit.description?.slice(0, 200),
      });
    }
  }
  opportunities.sort((a, b) => (a.score || 0) - (b.score || 0));

  // Diagnostics (non-opportunity fails)
  const diagnostics = [];
  for (const [id, audit] of Object.entries(audits)) {
    if (audit.details?.type === 'table' && audit.score !== null && audit.score < 1 &&
        !opportunities.find(o => o.id === id)) {
      diagnostics.push({
        id,
        title: audit.title,
        displayValue: audit.displayValue || '',
      });
    }
  }

  // Print report
  console.log('═'.repeat(60));
  console.log('🏎️  LIGHTHOUSE REPORT');
  console.log('═'.repeat(60));

  console.log('\n📊 Scores:');
  for (const [key, score] of Object.entries(scores)) {
    const emoji = score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    const bar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));
    console.log(`  ${emoji} ${key.padEnd(20)} ${bar} ${score}/100`);
  }

  console.log('\n⏱️  Core Web Vitals:');
  for (const [key, val] of Object.entries(cwv)) {
    console.log(`  ${key.padEnd(5)} ${val}`);
  }

  if (opportunities.length > 0) {
    console.log(`\n🔧 Top Opportunities (${opportunities.length}):`);
    for (const opp of opportunities.slice(0, 10)) {
      const emoji = opp.score === 0 ? '🔴' : '🟡';
      console.log(`  ${emoji} ${opp.title} (saves ~${opp.savings})`);
    }
  }

  if (diagnostics.length > 0) {
    console.log(`\n📋 Diagnostics (${diagnostics.length}):`);
    for (const d of diagnostics.slice(0, 10)) {
      console.log(`  ⚠️  ${d.title} ${d.displayValue ? `(${d.displayValue})` : ''}`);
    }
  }

  console.log(`\n📄 HTML report: ${htmlPath}`);
  console.log(`📄 JSON report: ${jsonPath}`);

  return { scores, cwv, opportunities, diagnostics, htmlPath, jsonPath };
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.log(`Lighthouse Performance Audit

Usage: node lighthouse.cjs <url> [options]

Options:
  --output-dir DIR    Output directory
  --categories LIST   Comma-separated categories (performance,accessibility,best-practices,seo)`);
  process.exit(0);
}

const url = args.find(a => !a.startsWith('--'));
const getArg = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };

const catArg = getArg('categories');
runLighthouse(url, {
  outputDir: getArg('output-dir'),
  categories: catArg ? catArg.split(',') : undefined,
});

module.exports = { runLighthouse };
