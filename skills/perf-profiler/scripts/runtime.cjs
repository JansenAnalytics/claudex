#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = path.join(process.env.HOME, 'openclaw/node_modules/playwright-core');
const CHROMIUM = '/usr/bin/chromium-browser';

function parseArgs(argv) {
  const args = { url: null, duration: 10, interaction: 'idle' };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--duration' || a === '-d') args.duration = parseInt(argv[++i]);
    else if (a === '--interaction' || a === '-i') args.interaction = argv[++i];
    else if (!a.startsWith('-')) args.url = a;
    i++;
  }
  return args;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('Usage: node runtime.cjs <url> [--duration 10] [--interaction scroll|click|idle]');
    process.exit(1);
  }

  const { chromium } = require(PLAYWRIGHT_PATH);
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  const client = await page.context().newCDPSession(page);

  await client.send('Performance.enable');
  await client.send('Tracing.start', {
    categories: 'devtools.timeline,v8.execute,disabled-by-default-devtools.timeline',
    options: 'sampling-frequency=1000',
  });

  console.log('\n⚡ RUNTIME PERFORMANCE PROFILING');
  console.log('═'.repeat(60));
  console.log(`URL: ${args.url}`);
  console.log(`Duration: ${args.duration}s`);
  console.log(`Interaction: ${args.interaction}\n`);

  await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Long task observer
  await page.evaluate(() => {
    window.__longTasks = [];
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const obs = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__longTasks.push({ duration: entry.duration, startTime: entry.startTime, name: entry.name });
          }
        });
        obs.observe({ entryTypes: ['longtask'] });
      } catch {}
    }
  }).catch(() => {});

  // Frame rate monitoring
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    function frame(ts) {
      window.__frames.push(ts - last);
      last = ts;
      if (window.__monitorFrames) requestAnimationFrame(frame);
    }
    window.__monitorFrames = true;
    requestAnimationFrame(frame);
  }).catch(() => {});

  // Perform interaction
  const endTime = Date.now() + args.duration * 1000;
  while (Date.now() < endTime) {
    if (args.interaction === 'scroll') {
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(100);
      if (Date.now() > endTime - 2000) {
        await page.evaluate(() => window.scrollTo(0, 0));
      }
    } else if (args.interaction === 'click') {
      const els = await page.$$('button, a, [role="button"], input');
      if (els.length > 0) {
        const idx = Math.floor(Math.random() * Math.min(els.length, 5));
        try { await els[idx].click({ timeout: 1000 }); } catch {}
      }
      await page.waitForTimeout(500);
    } else {
      await page.waitForTimeout(1000);
    }
  }

  // Stop frame monitoring
  await page.evaluate(() => { window.__monitorFrames = false; }).catch(() => {});

  // Collect long tasks
  const longTasks = await page.evaluate(() => window.__longTasks || []).catch(() => []);

  // Collect frame data
  const frameTimes = await page.evaluate(() => window.__frames || []).catch(() => []);
  const fps = frameTimes.length > 0 ? 1000 / (frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length) : 0;
  const droppedFrames = frameTimes.filter(t => t > 33.3).length; // below 30fps

  // Stop tracing and collect
  const traceChunks = [];
  client.on('Tracing.dataCollected', (params) => { traceChunks.push(...params.value); });
  await client.send('Tracing.end');
  await new Promise(r => client.on('Tracing.tracingComplete', r));

  // Analyze trace events
  const layoutEvents = traceChunks.filter(e => e.name === 'Layout');
  const paintEvents = traceChunks.filter(e => e.name === 'Paint');
  const recalcStyles = traceChunks.filter(e => e.name === 'UpdateLayoutTree' || e.name === 'RecalculateStyles');
  const jsExecution = traceChunks.filter(e => e.name === 'FunctionCall' || e.name === 'EvaluateScript');

  // Detect layout thrashing (rapid layout-style-layout sequences)
  let layoutThrashing = 0;
  const layoutTimes = layoutEvents.map(e => e.ts).sort();
  for (let i = 1; i < layoutTimes.length; i++) {
    if (layoutTimes[i] - layoutTimes[i-1] < 5000) layoutThrashing++; // within 5ms
  }

  // Get performance metrics
  const { metrics } = await client.send('Performance.getMetrics');
  const metricsMap = {};
  for (const m of metrics) metricsMap[m.name] = m.value;

  await browser.close();

  const findings = [];

  if (longTasks.length > 0) {
    const totalBlocking = longTasks.reduce((a, t) => a + (t.duration - 50), 0);
    findings.push({ severity: longTasks.length > 5 ? 'critical' : 'warning',
      message: `${longTasks.length} long tasks detected (total blocking time: ${totalBlocking.toFixed(0)}ms)` });
  }

  if (fps > 0 && fps < 30) {
    findings.push({ severity: 'critical', message: `Low frame rate: ${fps.toFixed(1)} FPS` });
  } else if (fps > 0 && fps < 55) {
    findings.push({ severity: 'warning', message: `Below-target frame rate: ${fps.toFixed(1)} FPS (target: 60)` });
  }

  if (layoutThrashing > 10) {
    findings.push({ severity: 'warning', message: `Potential layout thrashing: ${layoutThrashing} rapid layout recalculations` });
  }

  if (droppedFrames > frameTimes.length * 0.1) {
    findings.push({ severity: 'warning', message: `${droppedFrames}/${frameTimes.length} frames dropped (>${(droppedFrames/frameTimes.length*100).toFixed(0)}%)` });
  }

  console.log('Results:');
  console.log(`  Long tasks:      ${longTasks.length}${longTasks.length > 0 ? ` (worst: ${Math.max(...longTasks.map(t=>t.duration)).toFixed(0)}ms)` : ''}`);
  console.log(`  Frame rate:      ${fps > 0 ? fps.toFixed(1) + ' FPS' : 'N/A'}`);
  console.log(`  Dropped frames:  ${droppedFrames}/${frameTimes.length}`);
  console.log(`  Layouts:         ${layoutEvents.length}`);
  console.log(`  Paints:          ${paintEvents.length}`);
  console.log(`  Style recalcs:   ${recalcStyles.length}`);
  console.log(`  JS executions:   ${jsExecution.length}`);
  console.log(`  Layout thrash:   ${layoutThrashing} rapid sequences`);

  if (metricsMap.JSHeapUsedSize) {
    console.log(`  JS heap:         ${formatBytes(metricsMap.JSHeapUsedSize)}`);
  }
  if (metricsMap.TaskDuration) {
    console.log(`  Total CPU time:  ${(metricsMap.TaskDuration * 1000).toFixed(0)}ms`);
  }

  if (findings.length > 0) {
    console.log('\nFindings:');
    for (const f of findings) {
      console.log(`  ${f.severity === 'critical' ? '🔴' : '🟡'} ${f.message}`);
    }
  }

  const result = {
    url: args.url, duration: args.duration, interaction: args.interaction,
    longTasks: { count: longTasks.length, tasks: longTasks.slice(0, 20) },
    fps: fps > 0 ? parseFloat(fps.toFixed(1)) : null,
    droppedFrames, totalFrames: frameTimes.length,
    layoutEvents: layoutEvents.length, paintEvents: paintEvents.length,
    styleRecalcs: recalcStyles.length, jsExecutions: jsExecution.length,
    layoutThrashing, metrics: metricsMap, findings,
  };

  const outPath = path.join(process.cwd(), 'runtime-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nFull report: ${outPath}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
