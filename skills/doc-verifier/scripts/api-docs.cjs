#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const apiUrl = args.find((a, i) => args[i - 1] === '--api-url') || '';
const outputDir = args.find((a, i) => args[i - 1] === '--output-dir') || projectDir;

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

// Parse markdown for API endpoint patterns like: GET /api/users, POST /api/items
function extractEndpointsFromDocs(dir) {
  const files = findMarkdownFiles(dir);
  const endpoints = [];
  const methodRe = /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\/[^\s,)}\]]+)/gi;
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = methodRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], file: path.relative(dir, f) });
    }
  }
  return endpoints;
}

// Try loading OpenAPI/Swagger spec
function loadOpenAPI(dir) {
  for (const name of ['openapi.json', 'openapi.yaml', 'openapi.yml', 'swagger.json', 'swagger.yaml']) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        return JSON.parse(content);
      } catch { /* yaml not supported without deps */ }
    }
  }
  return null;
}

function extractEndpointsFromOpenAPI(spec) {
  const endpoints = [];
  if (!spec || !spec.paths) return endpoints;
  for (const [p, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        endpoints.push({ method: method.toUpperCase(), path: p, source: 'openapi' });
      }
    }
  }
  return endpoints;
}

function httpRequest(url, method) {
  return new Promise(resolve => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.request(url, { method, timeout: 10000, headers: { 'User-Agent': 'doc-verifier/1.0', Accept: 'application/json' } }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', e => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.end();
  });
}

async function main() {
  const dir = path.resolve(projectDir);
  if (!apiUrl) {
    console.log('No --api-url provided. Extracting documented endpoints only.');
  }

  const docEndpoints = extractEndpointsFromDocs(dir);
  const spec = loadOpenAPI(dir);
  const specEndpoints = extractEndpointsFromOpenAPI(spec);
  const allDocEndpoints = [...docEndpoints, ...specEndpoints];

  // Deduplicate
  const seen = new Set();
  const unique = allDocEndpoints.filter(e => {
    const key = `${e.method} ${e.path}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });

  const results = [];
  for (const ep of unique) {
    const entry = { method: ep.method, path: ep.path, file: ep.file || ep.source || 'openapi', status: null, exists: null };
    if (apiUrl) {
      const url = apiUrl.replace(/\/$/, '') + ep.path;
      const res = await httpRequest(url, ep.method);
      entry.status = res.status;
      entry.exists = res.status !== 404 && res.status !== 0;
      if (res.error) entry.error = res.error;
    }
    results.push(entry);
  }

  const report = {
    timestamp: new Date().toISOString(),
    projectDir: dir,
    apiUrl: apiUrl || null,
    totalDocumented: unique.length,
    tested: apiUrl ? unique.length : 0,
    existing: results.filter(r => r.exists === true).length,
    missing: results.filter(r => r.exists === false).length,
    results
  };

  const outPath = path.join(path.resolve(outputDir), 'api-docs-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`API docs report: ${report.totalDocumented} documented endpoints${apiUrl ? `, ${report.existing} exist, ${report.missing} missing` : ''}`);
  console.log(`Written to ${outPath}`);
}

if (require.main === module) main();
module.exports = { extractEndpointsFromDocs };
