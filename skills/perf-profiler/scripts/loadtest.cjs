#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');

function parseArgs(argv) {
  const args = { urls: [], concurrency: 10, duration: 0, requests: 100, ramp: false, method: 'GET', body: null, headers: {} };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--concurrency' || a === '-c') { args.concurrency = parseInt(argv[++i]); }
    else if (a === '--duration' || a === '-d') { args.duration = parseInt(argv[++i]); }
    else if (a === '--requests' || a === '-n') { args.requests = parseInt(argv[++i]); }
    else if (a === '--ramp') { args.ramp = true; }
    else if (a === '--method' || a === '-m') { args.method = argv[++i].toUpperCase(); }
    else if (a === '--body') { args.body = argv[++i]; }
    else if (a === '--header' || a === '-H') {
      const [k, ...v] = argv[++i].split(':');
      args.headers[k.trim()] = v.join(':').trim();
    }
    else if (!a.startsWith('-')) { args.urls.push(a); }
    i++;
  }
  return args;
}

function makeRequest(url, method, body, headers) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search,
      method, headers: { ...headers },
    };
    if (body) { opts.headers['content-length'] = Buffer.byteLength(body); }

    const req = mod.request(opts, (res) => {
      let size = 0;
      res.on('data', (c) => { size += c.length; });
      res.on('end', () => {
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({ status: res.statusCode, latency: elapsed, size, error: null });
      });
    });
    req.on('error', (err) => {
      const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
      resolve({ status: 0, latency: elapsed, size: 0, error: err.message });
    });
    req.setTimeout(30000, () => { req.destroy(); });
    if (body) req.write(body);
    req.end();
  });
}

function percentile(sorted, p) {
  const idx = Math.ceil(sorted.length * p / 100) - 1;
  return sorted[Math.max(0, idx)];
}

async function runBatch(url, method, body, headers, count, concurrency) {
  const results = [];
  let completed = 0;
  const startTime = Date.now();

  async function worker() {
    while (completed < count) {
      const idx = completed++;
      if (idx >= count) break;
      results.push(await makeRequest(url, method, body, headers));
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, count); i++) workers.push(worker());
  await Promise.all(workers);

  const elapsed = (Date.now() - startTime) / 1000;
  return { results, elapsed };
}

async function runDuration(url, method, body, headers, durationSec, concurrency) {
  const results = [];
  const endTime = Date.now() + durationSec * 1000;
  let running = true;

  async function worker() {
    while (running) {
      results.push(await makeRequest(url, method, body, headers));
      if (Date.now() >= endTime) running = false;
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  return { results, elapsed: durationSec };
}

async function runRamp(url, method, body, headers, maxConcurrency) {
  const steps = [];
  for (let c = 1; c <= maxConcurrency; c = Math.min(c * 2, maxConcurrency + 1)) {
    if (c > maxConcurrency) break;
    const { results, elapsed } = await runBatch(url, method, body, headers, c * 5, c);
    const latencies = results.map(r => r.latency).sort((a, b) => a - b);
    const errors = results.filter(r => r.error || r.status >= 500).length;
    steps.push({
      concurrency: c, requests: results.length, rps: (results.length / elapsed).toFixed(1),
      meanLatency: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1),
      p99: percentile(latencies, 99).toFixed(1),
      errorRate: ((errors / results.length) * 100).toFixed(1) + '%',
    });
    console.log(`  Concurrency ${c}: ${steps[steps.length-1].rps} req/s, p99=${steps[steps.length-1].p99}ms, errors=${steps[steps.length-1].errorRate}`);
    if (c === maxConcurrency) break;
    if (c * 2 > maxConcurrency && c < maxConcurrency) c = maxConcurrency - 1; // ensure we hit max
  }
  return steps;
}

function summarize(results, elapsed) {
  const latencies = results.map(r => r.latency).sort((a, b) => a - b);
  const errors = results.filter(r => r.error).length;
  const statusCodes = {};
  for (const r of results) { statusCodes[r.status] = (statusCodes[r.status] || 0) + 1; }

  return {
    totalRequests: results.length,
    elapsed: elapsed.toFixed(2) + 's',
    requestsPerSec: (results.length / elapsed).toFixed(1),
    meanLatency: (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1) + 'ms',
    p50: percentile(latencies, 50).toFixed(1) + 'ms',
    p95: percentile(latencies, 95).toFixed(1) + 'ms',
    p99: percentile(latencies, 99).toFixed(1) + 'ms',
    minLatency: latencies[0].toFixed(1) + 'ms',
    maxLatency: latencies[latencies.length - 1].toFixed(1) + 'ms',
    errorRate: ((errors / results.length) * 100).toFixed(1) + '%',
    statusCodes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.urls.length === 0) {
    console.error('Usage: node loadtest.cjs <url> [--concurrency 10] [--duration 30] [--requests 1000] [--ramp]');
    process.exit(1);
  }

  const url = args.urls[0];
  console.log('\n🔥 LOAD TEST');
  console.log('═'.repeat(60));
  console.log(`Target: ${url}`);
  console.log(`Method: ${args.method}, Concurrency: ${args.concurrency}`);

  let allResults, elapsed, rampSteps;

  if (args.ramp) {
    console.log(`Mode: Ramp up to ${args.concurrency} concurrency\n`);
    rampSteps = await runRamp(url, args.method, args.body, args.headers, args.concurrency);
  } else if (args.duration > 0) {
    console.log(`Mode: Duration ${args.duration}s\n`);
    const r = await runDuration(url, args.method, args.body, args.headers, args.duration, args.concurrency);
    allResults = r.results; elapsed = r.elapsed;
  } else {
    console.log(`Mode: ${args.requests} requests\n`);
    const r = await runBatch(url, args.method, args.body, args.headers, args.requests, args.concurrency);
    allResults = r.results; elapsed = r.elapsed;
  }

  if (allResults) {
    const summary = summarize(allResults, elapsed);
    console.log('Results:');
    console.log(`  Total requests:  ${summary.totalRequests}`);
    console.log(`  Duration:        ${summary.elapsed}`);
    console.log(`  Requests/sec:    ${summary.requestsPerSec}`);
    console.log(`  Mean latency:    ${summary.meanLatency}`);
    console.log(`  P50 latency:     ${summary.p50}`);
    console.log(`  P95 latency:     ${summary.p95}`);
    console.log(`  P99 latency:     ${summary.p99}`);
    console.log(`  Min/Max:         ${summary.minLatency} / ${summary.maxLatency}`);
    console.log(`  Error rate:      ${summary.errorRate}`);
    console.log(`  Status codes:    ${JSON.stringify(summary.statusCodes)}`);

    const outPath = path.join(process.cwd(), 'loadtest-results.json');
    fs.writeFileSync(outPath, JSON.stringify({ ...summary, ramp: null }, null, 2));
    console.log(`\nFull report: ${outPath}`);
  }

  if (rampSteps) {
    const outPath = path.join(process.cwd(), 'loadtest-results.json');
    fs.writeFileSync(outPath, JSON.stringify({ ramp: rampSteps }, null, 2));
    console.log(`\nFull report: ${outPath}`);
  }
}

// Need path for output
const path = require('path');
main().catch(e => { console.error(e); process.exit(1); });
