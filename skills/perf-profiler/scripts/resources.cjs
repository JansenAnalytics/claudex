#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { URL } = require('url');

const PLAYWRIGHT_PATH = path.join(process.env.HOME, 'openclaw/node_modules/playwright-core');
const CHROMIUM = '/usr/bin/chromium-browser';

const VIEWPORTS = {
  mobile: { width: 375, height: 812, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
  desktop: { width: 1440, height: 900 },
};

function parseArgs(argv) {
  const args = { url: null, viewport: 'desktop' };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--viewport' || a === '-v') args.viewport = argv[++i];
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

function isThirdParty(resourceUrl, pageUrl) {
  try {
    const r = new URL(resourceUrl);
    const p = new URL(pageUrl);
    return r.hostname !== p.hostname;
  } catch { return true; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('Usage: node resources.cjs <url> [--viewport mobile|desktop]');
    process.exit(1);
  }

  const { chromium } = require(PLAYWRIGHT_PATH);
  const vp = VIEWPORTS[args.viewport] || VIEWPORTS.desktop;
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
  const page = await context.newPage();
  const client = await page.context().newCDPSession(page);

  await client.send('Network.enable');
  await client.send('Performance.enable');

  const resources = [];
  const requestTimes = {};

  client.on('Network.requestWillBeSent', (params) => {
    requestTimes[params.requestId] = { url: params.request.url, method: params.request.method, startTime: params.timestamp, type: params.type };
  });

  client.on('Network.responseReceived', (params) => {
    if (requestTimes[params.requestId]) {
      const r = requestTimes[params.requestId];
      r.status = params.response.status;
      r.mimeType = params.response.mimeType;
      r.protocol = params.response.protocol || 'unknown';
      r.headers = params.response.headers;
      r.encodedSize = params.response.encodedDataLength || 0;
      r.fromCache = params.response.fromDiskCache || params.response.fromServiceWorker || false;
      const enc = (params.response.headers['content-encoding'] || params.response.headers['Content-Encoding'] || '').toLowerCase();
      r.compressed = enc.includes('gzip') || enc.includes('br') || enc.includes('deflate');
    }
  });

  client.on('Network.loadingFinished', (params) => {
    if (requestTimes[params.requestId]) {
      const r = requestTimes[params.requestId];
      r.endTime = params.timestamp;
      r.transferSize = params.encodedDataLength || r.encodedSize || 0;
      r.duration = ((r.endTime - r.startTime) * 1000);
      resources.push(r);
    }
  });

  console.log('\n🌐 RESOURCE ANALYSIS');
  console.log('═'.repeat(60));
  console.log(`URL: ${args.url}`);
  console.log(`Viewport: ${args.viewport} (${vp.width}x${vp.height})\n`);

  await page.goto(args.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Render-blocking resources
  const renderBlocking = await page.evaluate(() => {
    const blocking = [];
    document.querySelectorAll('link[rel="stylesheet"]').forEach(el => {
      if (!el.media || el.media === 'all' || el.media === 'screen') {
        blocking.push({ url: el.href, type: 'css', tag: 'link' });
      }
    });
    document.querySelectorAll('script[src]').forEach(el => {
      if (!el.async && !el.defer && !el.type?.includes('module')) {
        blocking.push({ url: el.src, type: 'js', tag: 'script' });
      }
    });
    return blocking;
  }).catch(() => []);

  // Image optimization check
  const imageIssues = await page.evaluate(() => {
    const issues = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.naturalWidth > 0 && img.clientWidth > 0) {
        const ratio = img.naturalWidth / img.clientWidth;
        if (ratio > 2) {
          issues.push({
            src: img.src?.substring(0, 200),
            naturalSize: `${img.naturalWidth}x${img.naturalHeight}`,
            displaySize: `${img.clientWidth}x${img.clientHeight}`,
            ratio: ratio.toFixed(1),
          });
        }
      }
    });
    return issues;
  }).catch(() => []);

  // Unused CSS (basic check)
  const unusedCSS = await page.evaluate(() => {
    const unused = [];
    try {
      for (const sheet of document.styleSheets) {
        try {
          let total = 0, used = 0;
          for (const rule of sheet.cssRules) {
            if (rule.selectorText) {
              total++;
              try { if (document.querySelector(rule.selectorText)) used++; } catch {}
            }
          }
          if (total > 0) {
            const pct = ((total - used) / total * 100).toFixed(0);
            if (pct > 50) {
              unused.push({ href: sheet.href || 'inline', totalRules: total, usedRules: used, unusedPercent: pct + '%' });
            }
          }
        } catch {} // CORS
      }
    } catch {}
    return unused;
  }).catch(() => []);

  await browser.close();

  // Analyze
  const findings = [];
  const totalSize = resources.reduce((a, r) => a + (r.transferSize || 0), 0);
  const totalRequests = resources.length;
  const byType = {};
  const thirdParty = [];
  const slowResources = [];
  const uncompressed = [];
  const protocols = {};

  for (const r of resources) {
    const type = (r.mimeType || '').split('/')[1]?.split(';')[0] || r.type || 'other';
    byType[type] = byType[type] || { count: 0, size: 0 };
    byType[type].count++;
    byType[type].size += r.transferSize || 0;

    if (r.protocol) protocols[r.protocol] = (protocols[r.protocol] || 0) + 1;

    if (r.duration > 1000) {
      slowResources.push({ url: r.url.substring(0, 120), duration: r.duration.toFixed(0) + 'ms', size: formatBytes(r.transferSize || 0) });
    }

    if (!r.compressed && (r.transferSize || 0) > 1024 && (r.mimeType || '').match(/javascript|css|html|json|text/)) {
      uncompressed.push({ url: r.url.substring(0, 120), size: formatBytes(r.transferSize || 0) });
    }

    if (isThirdParty(r.url, args.url)) {
      thirdParty.push(r);
    }
  }

  const thirdPartySize = thirdParty.reduce((a, r) => a + (r.transferSize || 0), 0);
  const thirdPartyDomains = {};
  for (const r of thirdParty) {
    try {
      const domain = new URL(r.url).hostname;
      thirdPartyDomains[domain] = thirdPartyDomains[domain] || { count: 0, size: 0 };
      thirdPartyDomains[domain].count++;
      thirdPartyDomains[domain].size += r.transferSize || 0;
    } catch {}
  }

  // Output
  console.log(`Total requests:    ${totalRequests}`);
  console.log(`Total transfer:    ${formatBytes(totalSize)}`);
  console.log(`Protocols:         ${JSON.stringify(protocols)}`);

  console.log('\nBy type:');
  for (const [type, data] of Object.entries(byType).sort((a, b) => b[1].size - a[1].size)) {
    console.log(`  ${type.padEnd(15)} ${String(data.count).padStart(4)} files  ${formatBytes(data.size).padStart(10)}`);
  }

  if (renderBlocking.length > 0) {
    console.log(`\n⚠️  Render-blocking resources (${renderBlocking.length}):`);
    for (const r of renderBlocking.slice(0, 10)) {
      console.log(`  [${r.type}] ${r.url.substring(0, 100)}`);
    }
    findings.push({ severity: 'warning', message: `${renderBlocking.length} render-blocking resources` });
  }

  if (slowResources.length > 0) {
    console.log(`\n🐌 Slow resources (>${1}s):`);
    for (const r of slowResources.slice(0, 10)) {
      console.log(`  ${r.duration.padStart(8)} ${r.size.padStart(10)} ${r.url}`);
    }
    findings.push({ severity: 'warning', message: `${slowResources.length} slow resources (>1s)` });
  }

  if (uncompressed.length > 0) {
    console.log(`\n📦 Uncompressed text resources:`);
    for (const r of uncompressed.slice(0, 10)) {
      console.log(`  ${r.size.padStart(10)} ${r.url}`);
    }
    findings.push({ severity: 'warning', message: `${uncompressed.length} uncompressed text resources` });
  }

  if (imageIssues.length > 0) {
    console.log(`\n🖼️  Oversized images (served larger than displayed):`);
    for (const img of imageIssues.slice(0, 10)) {
      console.log(`  ${img.ratio}x oversized: ${img.naturalSize} → displayed ${img.displaySize}`);
      console.log(`    ${img.src}`);
    }
    findings.push({ severity: 'warning', message: `${imageIssues.length} oversized images` });
  }

  if (unusedCSS.length > 0) {
    console.log(`\n🗑️  Potentially unused CSS:`);
    for (const c of unusedCSS) {
      console.log(`  ${c.unusedPercent} unused (${c.usedRules}/${c.totalRules} rules): ${(c.href || 'inline').substring(0, 80)}`);
    }
  }

  if (Object.keys(thirdPartyDomains).length > 0) {
    console.log(`\n🌍 Third-party resources (${thirdParty.length} requests, ${formatBytes(thirdPartySize)}):`);
    const sorted = Object.entries(thirdPartyDomains).sort((a, b) => b[1].size - a[1].size);
    for (const [domain, data] of sorted.slice(0, 10)) {
      console.log(`  ${domain.padEnd(35)} ${String(data.count).padStart(3)} reqs  ${formatBytes(data.size).padStart(10)}`);
    }
  }

  if (findings.length > 0) {
    console.log('\nFindings:');
    for (const f of findings) {
      console.log(`  ${f.severity === 'critical' ? '🔴' : '🟡'} ${f.message}`);
    }
  }

  const result = {
    url: args.url, viewport: args.viewport, totalRequests, totalTransferSize: totalSize,
    byType, protocols, renderBlocking, slowResources, uncompressed, imageIssues, unusedCSS,
    thirdParty: { count: thirdParty.length, size: thirdPartySize, domains: thirdPartyDomains },
    findings,
  };

  const outPath = path.join(process.cwd(), 'resource-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\nFull report: ${outPath}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
