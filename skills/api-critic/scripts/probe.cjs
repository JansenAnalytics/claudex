#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let baseUrl = '';
let authHeader = '';
let timeoutMs = 10000;
let quick = false;
let full = false;
let outDir = '.';
let endpointsPath = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--auth' && args[i + 1]) authHeader = args[++i];
  else if (args[i] === '--timeout' && args[i + 1]) timeoutMs = parseInt(args[++i]);
  else if (args[i] === '--quick') quick = true;
  else if (args[i] === '--full') full = true;
  else if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i];
  else if (args[i] === '--endpoints' && args[i + 1]) endpointsPath = args[++i];
  else if (!args[i].startsWith('-')) baseUrl = args[i].replace(/\/+$/, '');
}

if (!baseUrl) { console.error('Usage: node probe.cjs <base-url> [options]'); process.exit(1); }

if (!endpointsPath) endpointsPath = path.join(outDir, 'discovered-endpoints.json');

function request(method, urlStr, body, headers = {}, timeout = timeoutMs) {
  return new Promise((resolve) => {
    const parsed = new URL(urlStr);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = {
      method,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers: { ...headers },
      timeout
    };
    if (authHeader && !headers['Authorization'] && headers['Authorization'] !== null) {
      opts.headers['Authorization'] = authHeader;
    }
    // Remove explicit null markers
    if (opts.headers['Authorization'] === null) delete opts.headers['Authorization'];

    const start = Date.now();
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
        timeMs: Date.now() - start
      }));
    });
    req.on('error', (e) => resolve({ status: 0, headers: {}, body: '', timeMs: Date.now() - start, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, headers: {}, body: '', timeMs: timeout, error: 'timeout' }); });
    if (body !== undefined && body !== null) {
      const b = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(b);
    }
    req.end();
  });
}

function result(endpoint, testName, category, severity, passed, message, details = {}) {
  return {
    endpoint: `${endpoint.method} ${endpoint.path}`,
    test: testName,
    category,
    severity,
    status: passed ? 'pass' : (severity === 'info' ? 'info' : 'fail'),
    message,
    ...details
  };
}

async function testHappyPath(ep) {
  const results = [];
  const fullUrl = baseUrl + ep.path;
  let body = ep.body || (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH'
    ? JSON.stringify({ title: 'test', body: 'test', userId: 1 }) : undefined);
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';

  const res = await request(ep.method, fullUrl, body, headers);

  if (res.error) {
    results.push(result(ep, 'happy-path', 'correctness', 'critical', false, `Request failed: ${res.error}`));
    return { results, response: res };
  }

  const ok = res.status >= 200 && res.status < 300;
  results.push(result(ep, 'happy-path', 'correctness', 'critical', ok,
    ok ? `${res.status} OK` : `Expected 2xx, got ${res.status}`, { statusCode: res.status }));

  // Response time
  if (res.timeMs > 2000) {
    results.push(result(ep, 'response-time', 'performance', 'critical', false, `${res.timeMs}ms (>2000ms critical)`, { timeMs: res.timeMs }));
  } else if (res.timeMs > 500) {
    results.push(result(ep, 'response-time', 'performance', 'medium', false, `${res.timeMs}ms (>500ms warning)`, { timeMs: res.timeMs }));
  } else {
    results.push(result(ep, 'response-time', 'performance', 'info', true, `${res.timeMs}ms`, { timeMs: res.timeMs }));
  }

  // Content-Type header
  const ct = res.headers['content-type'] || '';
  if (ok && res.body.length > 0) {
    if (!ct) {
      results.push(result(ep, 'content-type', 'standards', 'medium', false, 'Missing Content-Type header'));
    } else {
      results.push(result(ep, 'content-type', 'standards', 'info', true, ct));
    }
  }

  // Schema validation
  if (ok && ct.includes('json')) {
    try {
      const parsed = JSON.parse(res.body);
      results.push(result(ep, 'valid-json', 'correctness', 'high', true, 'Response is valid JSON'));
      if (Array.isArray(parsed)) {
        results.push(result(ep, 'schema-type', 'correctness', 'info', true, `Array with ${parsed.length} items`));
      } else if (typeof parsed === 'object' && parsed !== null) {
        const keys = Object.keys(parsed);
        results.push(result(ep, 'schema-type', 'correctness', 'info', true, `Object with keys: ${keys.slice(0, 10).join(', ')}`));
      }
    } catch {
      results.push(result(ep, 'valid-json', 'correctness', 'high', false, 'Content-Type says JSON but body is not valid JSON'));
    }
  }

  // CORS headers
  const corsHeader = res.headers['access-control-allow-origin'];
  if (corsHeader === '*') {
    results.push(result(ep, 'cors-wildcard', 'security', 'low', false, 'CORS allows all origins (*)'));
  }

  // Cache headers
  if (ep.method === 'GET' && ok) {
    const hasCache = res.headers['cache-control'] || res.headers['etag'] || res.headers['last-modified'];
    if (!hasCache) {
      results.push(result(ep, 'cache-headers', 'standards', 'low', false, 'No cache headers on GET response'));
    }
  }

  // Status code correctness
  if (ep.method === 'POST' && ok && res.status !== 201) {
    results.push(result(ep, 'status-code-create', 'standards', 'low', false,
      `POST returned ${res.status}, expected 201 Created`));
  }
  if (ep.method === 'DELETE' && ok && res.status !== 204 && res.status !== 200) {
    results.push(result(ep, 'status-code-delete', 'standards', 'low', false,
      `DELETE returned ${res.status}, expected 200 or 204`));
  }

  return { results, response: res };
}

async function testErrorHandling(ep) {
  const results = [];
  if (ep.method !== 'POST' && ep.method !== 'PUT' && ep.method !== 'PATCH') return results;
  const fullUrl = baseUrl + ep.path;

  // Empty body
  const r1 = await request(ep.method, fullUrl, '', { 'Content-Type': 'application/json' });
  if (r1.status >= 500) {
    results.push(result(ep, 'empty-body', 'error-handling', 'high', false, `Empty body caused ${r1.status} server error`));
  } else {
    results.push(result(ep, 'empty-body', 'error-handling', 'info', true, `Empty body → ${r1.status}`));
  }

  // Wrong content type
  const r2 = await request(ep.method, fullUrl, 'not json', { 'Content-Type': 'text/plain' });
  if (r2.status >= 500) {
    results.push(result(ep, 'wrong-content-type', 'error-handling', 'medium', false, `Wrong Content-Type caused ${r2.status} server error`));
  }

  // Null values
  const r3 = await request(ep.method, fullUrl, JSON.stringify({ title: null, body: null }), { 'Content-Type': 'application/json' });
  if (r3.status >= 500) {
    results.push(result(ep, 'null-values', 'error-handling', 'high', false, `Null values caused ${r3.status} server error`));
  }

  if (!quick) {
    // Oversized payload
    const bigBody = JSON.stringify({ data: 'x'.repeat(1024 * 1024) });
    const r4 = await request(ep.method, fullUrl, bigBody, { 'Content-Type': 'application/json' });
    if (r4.status >= 500) {
      results.push(result(ep, 'oversized-payload', 'error-handling', 'high', false, `1MB payload caused ${r4.status} server error`));
    } else if (r4.status === 413) {
      results.push(result(ep, 'oversized-payload', 'error-handling', 'info', true, 'Properly returns 413 for oversized payload'));
    }
  }

  return results;
}

async function testAuth(ep) {
  const results = [];
  if (!authHeader) return results;
  const fullUrl = baseUrl + ep.path;

  // Request without auth
  const r1 = await request(ep.method, fullUrl, ep.body ? JSON.stringify(ep.body) : undefined,
    { 'Content-Type': 'application/json', 'Authorization': null });
  if (r1.status >= 200 && r1.status < 300) {
    results.push(result(ep, 'no-auth-access', 'security', 'critical', false,
      `Endpoint accessible without auth (${r1.status})`));
  } else if (r1.status === 401 || r1.status === 403) {
    results.push(result(ep, 'no-auth-blocked', 'security', 'info', true,
      `Properly returns ${r1.status} without auth`));
  }

  // Malformed token
  const r2 = await request(ep.method, fullUrl, undefined,
    { 'Content-Type': 'application/json', 'Authorization': 'Bearer invalid.malformed.token' });
  if (r2.status >= 200 && r2.status < 300) {
    results.push(result(ep, 'malformed-token', 'security', 'critical', false,
      `Endpoint accepts malformed token (${r2.status})`));
  }

  return results;
}

async function testWrongMethod(ep) {
  const results = [];
  const wrongMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].filter(m => m !== ep.method);
  // Only test one wrong method to save time
  const testMethod = wrongMethods[0];
  const fullUrl = baseUrl + ep.path;
  const res = await request(testMethod, fullUrl);

  if (res.status === 405) {
    results.push(result(ep, 'wrong-method', 'standards', 'info', true,
      `${testMethod} → 405 Method Not Allowed`));
  } else if (res.status >= 200 && res.status < 300) {
    // Not necessarily a fail - many APIs respond to multiple methods
    results.push(result(ep, 'wrong-method', 'standards', 'low', false,
      `${testMethod} → ${res.status} (expected 405)`));
  }

  return results;
}

async function testEdgeCases(ep) {
  const results = [];
  if (quick) return results;
  const fullUrl = baseUrl + ep.path;

  // SQL injection in query
  const sqlUrl = fullUrl + (fullUrl.includes('?') ? '&' : '?') + "id=' OR 1=1--";
  const r1 = await request('GET', sqlUrl);
  if (r1.status >= 200 && r1.status < 300 && r1.body.length > 0) {
    // Check if it returned more data than expected
    results.push(result(ep, 'sql-injection-query', 'security', 'medium', false,
      `SQL injection string in query param returned ${r1.status} (review manually)`,
      { note: 'May be false positive - verify response content' }));
  }

  // XSS in POST body
  if (ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'PATCH') {
    const xssBody = JSON.stringify({ title: '<script>alert(1)</script>', body: 'test' });
    const r2 = await request(ep.method, fullUrl, xssBody, { 'Content-Type': 'application/json' });
    if (r2.status >= 200 && r2.status < 300 && r2.body.includes('<script>')) {
      results.push(result(ep, 'xss-reflection', 'security', 'high', false,
        'XSS payload reflected in response without sanitization'));
    }
  }

  // Extra unknown fields
  if (ep.method === 'POST' || ep.method === 'PUT') {
    const extraBody = JSON.stringify({ title: 'test', body: 'test', userId: 1, __proto__: { admin: true }, isAdmin: true });
    const r3 = await request(ep.method, fullUrl, extraBody, { 'Content-Type': 'application/json' });
    if (r3.status >= 200 && r3.status < 300) {
      try {
        const parsed = JSON.parse(r3.body);
        if (parsed.isAdmin || parsed.admin) {
          results.push(result(ep, 'mass-assignment', 'security', 'high', false,
            'Server accepted and returned unknown fields (potential mass assignment)'));
        }
      } catch {}
    }
  }

  return results;
}

async function testPagination(ep) {
  const results = [];
  if (ep.method !== 'GET') return results;
  const fullUrl = baseUrl + ep.path;

  const res = await request('GET', fullUrl);
  if (res.status !== 200) return results;

  try {
    const data = JSON.parse(res.body);
    if (!Array.isArray(data) || data.length < 2) return results;

    // Test _limit param
    const r1 = await request('GET', fullUrl + '?_limit=1');
    if (r1.status === 200) {
      try {
        const limited = JSON.parse(r1.body);
        if (Array.isArray(limited) && limited.length <= 1) {
          results.push(result(ep, 'pagination-limit', 'standards', 'info', true, 'Supports _limit parameter'));
        }
      } catch {}
    }

    // Test _start param
    const r2 = await request('GET', fullUrl + '?_start=1&_limit=1');
    if (r2.status === 200) {
      try {
        const offset = JSON.parse(r2.body);
        if (Array.isArray(offset) && offset.length <= 1) {
          results.push(result(ep, 'pagination-offset', 'standards', 'info', true, 'Supports _start parameter'));
        }
      } catch {}
    }
  } catch {}

  return results;
}

async function main() {
  if (!fs.existsSync(endpointsPath)) {
    console.error(`Endpoints file not found: ${endpointsPath}`);
    process.exit(1);
  }

  const endpoints = JSON.parse(fs.readFileSync(endpointsPath, 'utf8'));
  console.log(`Probing ${endpoints.length} endpoints against ${baseUrl}...`);
  if (quick) console.log('  (quick mode - skipping edge cases)');

  const allResults = [];
  let completed = 0;

  for (const ep of endpoints) {
    process.stdout.write(`\r  Testing ${++completed}/${endpoints.length}: ${ep.method} ${ep.path}     `);

    const { results: happyResults } = await testHappyPath(ep);
    allResults.push(...happyResults);

    const errorResults = await testErrorHandling(ep);
    allResults.push(...errorResults);

    const authResults = await testAuth(ep);
    allResults.push(...authResults);

    const methodResults = await testWrongMethod(ep);
    allResults.push(...methodResults);

    const edgeResults = await testEdgeCases(ep);
    allResults.push(...edgeResults);

    const paginationResults = await testPagination(ep);
    allResults.push(...paginationResults);
  }

  console.log('\n');

  const pass = allResults.filter(r => r.status === 'pass').length;
  const fail = allResults.filter(r => r.status === 'fail').length;
  const info = allResults.filter(r => r.status === 'info').length;

  console.log(`Results: ${pass} pass, ${fail} fail, ${info} info`);

  const outPath = path.join(outDir, 'probe-results.json');
  fs.writeFileSync(outPath, JSON.stringify(allResults, null, 2));
  console.log(`Saved to ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
