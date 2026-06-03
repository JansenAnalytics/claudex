#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputDir = args.find((a, i) => args[i - 1] === '--output-dir') || projectDir;
const timeout = parseInt(args.find((a, i) => args[i - 1] === '--timeout') || '10000');
const retries = parseInt(args.find((a, i) => args[i - 1] === '--retries') || '2');

function findMarkdownFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...findMarkdownFiles(full));
      else if (e.name.endsWith('.md')) results.push(full);
    }
  } catch {}
  return results;
}

function extractHeadings(content) {
  const headings = new Set();
  for (const line of content.split('\n')) {
    const m = line.match(/^#{1,6}\s+(.+)/);
    if (m) {
      const slug = m[1].trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      headings.add(slug);
    }
  }
  return headings;
}

function extractLinks(content, filePath) {
  const links = [];
  const lines = content.split('\n');
  const linkRe = /!?\[([^\]]*)\]\(([^)]+)\)/g;
  for (let i = 0; i < lines.length; i++) {
    let m;
    while ((m = linkRe.exec(lines[i])) !== null) {
      const isImage = m[0].startsWith('!');
      const text = m[1]; const url = m[2].split(/\s/)[0];
      links.push({ line: i + 1, text, url, isImage, file: filePath });
    }
  }
  return links;
}

function checkUrl(url, retriesLeft) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method: 'HEAD', timeout, headers: { 'User-Agent': 'doc-verifier/1.0' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        resolve({ status: res.statusCode, redirect: res.headers.location, ok: true });
      } else {
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 400 });
      }
    });
    req.on('error', e => {
      if (retriesLeft > 0) resolve(checkUrl(url, retriesLeft - 1));
      else resolve({ status: 0, ok: false, error: e.message });
    });
    req.on('timeout', () => {
      req.destroy();
      if (retriesLeft > 0) resolve(checkUrl(url, retriesLeft - 1));
      else resolve({ status: 0, ok: false, error: 'timeout' });
    });
    req.end();
  });
}

async function main() {
  const dir = path.resolve(projectDir);
  const files = findMarkdownFiles(dir);
  const results = [];
  const fileContents = {};
  for (const f of files) fileContents[f] = fs.readFileSync(f, 'utf8');

  // Rate limiter: max 5 external requests per second
  let lastBatch = 0;
  let batchCount = 0;
  async function rateLimited(fn) {
    const now = Date.now();
    if (now - lastBatch > 1000) { lastBatch = now; batchCount = 0; }
    batchCount++;
    if (batchCount > 5) { await new Promise(r => setTimeout(r, 1000 - (now - lastBatch))); lastBatch = Date.now(); batchCount = 1; }
    return fn();
  }

  for (const file of files) {
    const content = fileContents[file];
    const headings = extractHeadings(content);
    const links = extractLinks(content, file);
    for (const link of links) {
      const rel = path.relative(dir, file);
      const entry = { file: rel, line: link.line, text: link.text, url: link.url, type: '', status: '', ok: false };
      const url = link.url;
      if (url.startsWith('http://') || url.startsWith('https://')) {
        entry.type = 'external';
        const res = await rateLimited(() => checkUrl(url, retries));
        entry.status = res.status; entry.ok = res.ok;
        if (res.error) entry.error = res.error;
        if (res.redirect) entry.redirect = res.redirect;
      } else if (url.startsWith('#')) {
        entry.type = 'anchor';
        const anchor = url.slice(1);
        entry.ok = headings.has(anchor);
        entry.status = entry.ok ? 'found' : 'missing';
      } else {
        // Internal link, possibly with anchor
        const [filePart, anchor] = url.split('#');
        const target = filePart ? path.resolve(path.dirname(file), filePart) : file;
        entry.type = link.isImage ? 'image' : (anchor ? 'cross-file-anchor' : 'internal');
        if (filePart && !fs.existsSync(target)) {
          entry.ok = false; entry.status = 'file-not-found';
        } else if (anchor) {
          const targetContent = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
          const targetHeadings = extractHeadings(targetContent);
          entry.ok = targetHeadings.has(anchor);
          entry.status = entry.ok ? 'found' : 'anchor-not-found';
        } else {
          entry.ok = true; entry.status = 'found';
        }
      }
      results.push(entry);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    projectDir: dir,
    totalLinks: results.length,
    valid: results.filter(r => r.ok).length,
    broken: results.filter(r => !r.ok).length,
    results
  };

  const outPath = path.join(path.resolve(outputDir), 'links-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Links report: ${report.valid} valid, ${report.broken} broken out of ${report.totalLinks}`);
  console.log(`Written to ${outPath}`);
}

if (require.main === module) main();
module.exports = { findMarkdownFiles, extractLinks, extractHeadings };
