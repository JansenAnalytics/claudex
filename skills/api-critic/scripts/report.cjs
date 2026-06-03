#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let outDir = '.';
let inputPath = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i];
  else if (args[i] === '--input' && args[i + 1]) inputPath = args[++i];
}

if (!inputPath) inputPath = path.join(outDir, 'probe-results.json');

if (!fs.existsSync(inputPath)) {
  console.error(`Results file not found: ${inputPath}`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

// Severity weights for scoring
const severityWeight = { critical: 20, high: 10, medium: 5, low: 2, info: 0 };
const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// Separate passes and failures
const passes = results.filter(r => r.status === 'pass');
const failures = results.filter(r => r.status === 'fail');
const infos = results.filter(r => r.status === 'info');

// Calculate score
const maxDeduction = 100;
let deduction = 0;
for (const f of failures) {
  deduction += severityWeight[f.severity] || 0;
}
const score = Math.max(0, Math.min(100, 100 - deduction));

// Group failures by category
const categories = {};
for (const f of failures) {
  if (!categories[f.category]) categories[f.category] = [];
  categories[f.category].push(f);
}

// Fix suggestions
const fixes = {
  'happy-path': 'Ensure endpoint returns 2xx for valid requests. Check server logs for errors.',
  'response-time': 'Optimize database queries, add caching, or check for N+1 query problems.',
  'content-type': 'Add Content-Type header to all responses. Use application/json for JSON APIs.',
  'valid-json': 'Ensure response body is valid JSON when Content-Type is application/json.',
  'cors-wildcard': 'Restrict CORS to specific origins instead of wildcard (*) in production.',
  'cache-headers': 'Add Cache-Control, ETag, or Last-Modified headers to GET responses.',
  'empty-body': 'Handle empty/malformed request bodies gracefully. Return 400 Bad Request, not 500.',
  'wrong-content-type': 'Validate Content-Type header. Return 415 Unsupported Media Type for wrong types.',
  'null-values': 'Validate input fields. Return 400 with descriptive error for null/missing required fields.',
  'oversized-payload': 'Set max body size limit. Return 413 Payload Too Large for oversized requests.',
  'no-auth-access': 'Add authentication middleware. Protected endpoints must return 401/403 without valid auth.',
  'malformed-token': 'Validate token format and signature. Reject malformed tokens with 401.',
  'wrong-method': 'Return 405 Method Not Allowed for unsupported HTTP methods. Set Allow header.',
  'sql-injection-query': 'Use parameterized queries. Never interpolate user input into SQL strings.',
  'xss-reflection': 'Sanitize/escape user input before including in responses. Use Content-Type: application/json.',
  'mass-assignment': 'Whitelist allowed fields. Reject or strip unknown fields from request body.',
  'status-code-create': 'POST endpoints creating resources should return 201 Created, not 200.',
  'status-code-delete': 'DELETE endpoints should return 204 No Content or 200 OK.',
};

// Generate markdown report
let md = `# API Critic Report\n\n`;
md += `**Score: ${score}/100** ${score >= 80 ? '🟢' : score >= 60 ? '🟡' : score >= 40 ? '🟠' : '🔴'}\n\n`;
md += `| Metric | Count |\n|--------|-------|\n`;
md += `| ✅ Pass | ${passes.length} |\n`;
md += `| ❌ Fail | ${failures.length} |\n`;
md += `| ℹ️ Info | ${infos.length} |\n`;
md += `| 📊 Total | ${results.length} |\n\n`;

if (failures.length === 0) {
  md += `## All tests passed! 🎉\n\nNo issues found.\n`;
} else {
  // Sort failures by severity
  failures.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

  for (const [cat, issues] of Object.entries(categories)) {
    md += `## ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n\n`;
    for (const issue of issues) {
      const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[issue.severity] || '⚪';
      md += `### ${icon} [${issue.severity.toUpperCase()}] ${issue.endpoint} — ${issue.test}\n\n`;
      md += `${issue.message}\n\n`;
      if (fixes[issue.test]) {
        md += `**Fix:** ${fixes[issue.test]}\n\n`;
      }
    }
  }
}

// Generate JSON summary
const summary = {
  score,
  grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
  totalTests: results.length,
  passed: passes.length,
  failed: failures.length,
  info: infos.length,
  byCategory: {},
  bySeverity: {},
  issues: failures.map(f => ({
    endpoint: f.endpoint,
    test: f.test,
    category: f.category,
    severity: f.severity,
    message: f.message,
    fix: fixes[f.test] || 'Review and fix manually.'
  }))
};

for (const f of failures) {
  summary.byCategory[f.category] = (summary.byCategory[f.category] || 0) + 1;
  summary.bySeverity[f.severity] = (summary.bySeverity[f.severity] || 0) + 1;
}

const mdPath = path.join(outDir, 'api-critic-report.md');
const jsonPath = path.join(outDir, 'api-critic-report.json');

fs.writeFileSync(mdPath, md);
fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

console.log(`\nAPI Critic Report — Score: ${score}/100 (${summary.grade})`);
console.log(`  ✅ ${passes.length} pass | ❌ ${failures.length} fail | ℹ️ ${infos.length} info`);
if (failures.length > 0) {
  console.log(`\n  Issues by severity:`);
  for (const [sev, count] of Object.entries(summary.bySeverity).sort((a, b) => severityOrder[a[0]] - severityOrder[b[0]])) {
    console.log(`    ${sev}: ${count}`);
  }
}
console.log(`\nReports: ${mdPath}, ${jsonPath}`);
