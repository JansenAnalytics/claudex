#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = path.join(process.env.HOME, 'openclaw/node_modules/playwright-core');
const CHROMIUM = '/usr/bin/chromium-browser';

function parseArgs(argv) {
  const args = { url: null, iterations: 10, actions: null };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--iterations' || a === '-i') args.iterations = parseInt(argv[++i]);
    else if (a === '--actions') args.actions = argv[++i];
    else if (!a.startsWith('-')) args.url = a;
    i++;
  }
  return args;
}

function linearRegression(ys) {
  const n = ys.length;
  if (n < 3) return { slope: 0, r2: 0 };
  const xs = ys.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * i + intercept)) ** 2, 0);
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, r2 };
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('Usage: node memory.cjs <url> [--iterations 10] [--actions flow.json]');
    process.exit(1);
  }

  const { chromium } = require(PLAYWRIGHT_PATH);
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--js-flags=--expose-gc'],
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  const client = await page.context().newCDPSession(page);

  // Load custom actions
  let customActions = null;
  if (args.actions) {
    customActions = JSON.parse(fs.readFileSync(args.actions, 'utf8'));
  }

  console.log('\n🧠 MEMORY LEAK DETECTION');
  console.log('═'.repeat(60));
  console.log(`URL: ${args.url}`);
  console.log(`Iterations: ${args.iterations}\n`);

  await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Force GC and measure
  async function measureHeap() {
    await client.send('HeapProfiler.collectGarbage');
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(() => {
      if (typeof gc === 'function') gc();
      return performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : null;
    }).catch(() => null);

    if (metrics) return metrics.usedJSHeapSize;

    // Fallback: CDP metrics
    const { metrics: cdpMetrics } = await client.send('Performance.getMetrics');
    const jsHeap = cdpMetrics.find(m => m.name === 'JSHeapUsedSize');
    return jsHeap ? jsHeap.value : 0;
  }

  await client.send('Performance.enable');
  const initialHeap = await measureHeap();
  const heapSizes = [initialHeap];

  console.log(`Initial heap: ${formatBytes(initialHeap)}`);

  async function defaultActions() {
    // Scroll down and up
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Click interactive elements
    const buttons = await page.$$('button, a, [role="button"]');
    if (buttons.length > 0) {
      try { await buttons[0].click({ timeout: 1000 }); } catch {}
      await page.waitForTimeout(500);
    }

    // Navigate and come back
    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  async function runCustomActions(actions) {
    for (const action of (actions.steps || actions)) {
      try {
        if (action.action === 'click' && action.selector) {
          await page.click(action.selector, { timeout: 5000 });
        } else if (action.action === 'navigate' && action.url) {
          await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        } else if (action.action === 'scroll') {
          await page.evaluate((y) => window.scrollTo(0, y), action.y || 1000);
        } else if (action.action === 'wait') {
          await page.waitForTimeout(action.ms || 1000);
        } else if (action.action === 'type' && action.selector) {
          await page.fill(action.selector, action.text || '');
        }
      } catch {}
      await page.waitForTimeout(200);
    }
  }

  for (let i = 0; i < args.iterations; i++) {
    if (customActions) {
      await runCustomActions(customActions);
    } else {
      await defaultActions();
    }

    const heap = await measureHeap();
    heapSizes.push(heap);
    const growth = heap - initialHeap;
    console.log(`  Iteration ${i + 1}: ${formatBytes(heap)} (${growth >= 0 ? '+' : ''}${formatBytes(growth)})`);
  }

  const finalHeap = heapSizes[heapSizes.length - 1];
  const { slope, r2 } = linearRegression(heapSizes);
  const leakDetected = slope > 50000 && r2 > 0.7; // >50KB/iteration with good fit

  console.log('\n' + '─'.repeat(40));
  console.log(`Initial heap:      ${formatBytes(initialHeap)}`);
  console.log(`Final heap:        ${formatBytes(finalHeap)}`);
  console.log(`Total growth:      ${formatBytes(finalHeap - initialHeap)}`);
  console.log(`Growth/iteration:  ${formatBytes(Math.abs(slope))}`);
  console.log(`Regression R²:     ${r2.toFixed(3)}`);
  console.log(`Leak detected:     ${leakDetected ? '🔴 YES' : '🟢 NO'}`);

  const result = {
    url: args.url,
    iterations: args.iterations,
    initialHeap, finalHeap,
    totalGrowth: finalHeap - initialHeap,
    growthPerIteration: Math.round(slope),
    regressionR2: r2,
    leakDetected,
    heapSizes,
    findings: [],
  };

  if (leakDetected) {
    result.findings.push({
      severity: 'critical',
      message: `Memory leak detected: heap grows ~${formatBytes(slope)}/iteration with R²=${r2.toFixed(2)}`,
    });
  }

  const outPath = path.join(process.cwd(), 'memory-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nFull report: ${outPath}`);

  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
