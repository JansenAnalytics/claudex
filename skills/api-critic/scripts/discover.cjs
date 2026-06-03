#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const path = require('path');

const args = process.argv.slice(2);
let baseUrl = '';
let endpointsFile = '';
let outDir = '.';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--endpoints' && args[i + 1]) endpointsFile = args[++i];
  else if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i];
  else if (!args[i].startsWith('-')) baseUrl = args[i].replace(/\/+$/, '');
}

if (!baseUrl && !endpointsFile) {
  console.error('Usage: node discover.cjs <base-url> [--endpoints FILE] [--out-dir DIR]');
  process.exit(1);
}

function fetch(u, timeout = 5000) {
  return new Promise((resolve) => {
    const parsed = new URL(u);
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.get(u, { timeout }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function extractOpenApiEndpoints(spec) {
  const endpoints = [];
  const paths = spec.paths || {};
  for (const [p, methods] of Object.entries(paths)) {
    for (const [method, detail] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
        endpoints.push({
          method: method.toUpperCase(),
          path: p,
          description: (detail.summary || detail.description || '').substring(0, 200)
        });
      }
    }
  }
  return endpoints;
}

async function trySpecUrls() {
  const specPaths = [
    '/openapi.json', '/swagger.json', '/api-docs', '/swagger/v1/swagger.json',
    '/api/swagger.json', '/api/openapi.json', '/v1/api-docs', '/v2/api-docs',
    '/api-docs.json'
  ];
  for (const sp of specPaths) {
    const res = await fetch(baseUrl + sp);
    if (res && res.status === 200) {
      try {
        const spec = JSON.parse(res.body);
        if (spec.paths || spec.openapi || spec.swagger) {
          console.log(`  Found API spec at ${sp}`);
          return extractOpenApiEndpoints(spec);
        }
      } catch {}
    }
  }
  return [];
}

async function probeCommonPaths() {
  const common = [
    { method: 'GET', paths: ['/api', '/api/v1', '/v1', '/v2', '/graphql', '/health', '/status',
      '/posts', '/users', '/comments', '/todos', '/albums', '/photos',
      '/api/posts', '/api/users', '/api/items', '/api/products',
      '/api/v1/posts', '/api/v1/users'] }
  ];
  const found = [];
  for (const group of common) {
    const promises = group.paths.map(async (p) => {
      const res = await fetch(baseUrl + p);
      if (res && res.status >= 200 && res.status < 400) {
        found.push({ method: group.method, path: p, description: `Discovered (HTTP ${res.status})` });
      }
    });
    await Promise.all(promises);
  }
  return found;
}

async function inferMethodsFromGet(endpoints) {
  // For discovered GET endpoints that look like collections, also register POST
  // For /resource/:id patterns, register PUT/PATCH/DELETE
  const extra = [];
  for (const ep of endpoints) {
    if (ep.method !== 'GET') continue;
    const p = ep.path;
    // Collection endpoint - try POST
    if (/^\/[a-z-]+$/i.test(p) || /^\/api(\/v\d+)?\/[a-z-]+$/i.test(p)) {
      extra.push({ method: 'POST', path: p, description: `Inferred create for ${p}` });
      // Also infer item endpoints
      extra.push({ method: 'GET', path: p + '/1', description: `Inferred item for ${p}` });
      extra.push({ method: 'PUT', path: p + '/1', description: `Inferred update for ${p}` });
      extra.push({ method: 'PATCH', path: p + '/1', description: `Inferred partial update for ${p}` });
      extra.push({ method: 'DELETE', path: p + '/1', description: `Inferred delete for ${p}` });
    }
  }
  // Verify extra endpoints exist
  const verified = [];
  for (const ep of extra) {
    const res = await fetch(baseUrl + ep.path, 3000);
    if (res && res.status < 500) {
      verified.push(ep);
    }
  }
  return verified;
}

async function main() {
  let endpoints = [];

  if (endpointsFile) {
    console.log('Loading manual endpoints file...');
    const data = JSON.parse(fs.readFileSync(endpointsFile, 'utf8'));
    endpoints = data.map(e => ({
      method: (e.method || 'GET').toUpperCase(),
      path: e.path,
      description: e.description || 'Manual',
      body: e.body || null
    }));
  }

  if (baseUrl) {
    console.log(`Discovering endpoints for ${baseUrl}...`);

    console.log('  Trying API spec URLs...');
    const specEndpoints = await trySpecUrls();
    endpoints.push(...specEndpoints);

    if (endpoints.length === 0) {
      console.log('  Probing common paths...');
      const probed = await probeCommonPaths();
      endpoints.push(...probed);
    }

    if (endpoints.length > 0) {
      console.log('  Inferring CRUD methods...');
      const inferred = await inferMethodsFromGet(endpoints);
      endpoints.push(...inferred);
    }
  }

  // Deduplicate
  const seen = new Set();
  endpoints = endpoints.filter(e => {
    const key = `${e.method}:${e.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nDiscovered ${endpoints.length} endpoints`);
  endpoints.forEach(e => console.log(`  ${e.method.padEnd(7)} ${e.path}`));

  const outPath = path.join(outDir, 'discovered-endpoints.json');
  fs.writeFileSync(outPath, JSON.stringify(endpoints, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
