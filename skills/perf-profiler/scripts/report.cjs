#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { inputDir: '.', outputDir: '.', compare: null, format: 'both' };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--input-dir') args.inputDir = argv[++i];
    else if (a === '--output-dir') args.outputDir = argv[++i];
    else if (a === '--compare') args.compare = argv[++i];
    else if (a === '--format') args.format = argv[++i];
    else if (!a.startsWith('-')) args.inputDir = a;
    i++;
  }
  return args;
}

function loadJSON(dir, name) {
  const p = path.join(dir, name);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function formatBytes(b) {
  if (b == null) return 'N/A';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function scoreSeverity(findings) {
  let score = 100;
  for (const f of (findings || [])) {
    if (f.severity === 'critical') score -= 15;
    else if (f.severity === 'warning') score -= 5;
    else score -= 2;
  }
  return Math.max(0, score);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(args.inputDir);

  const bundle = loadJSON(dir, 'bundle-analysis.json');
  const memory = loadJSON(dir, 'memory-analysis.json');
  const loadtest = loadJSON(dir, 'loadtest-results.json');
  const resources = loadJSON(dir, 'resource-analysis.json');
  const runtime = loadJSON(dir, 'runtime-analysis.json');

  const allFindings = [];
  const categories = {};

  if (bundle) {
    categories['bundle-size'] = { score: scoreSeverity(bundle.findings), findings: bundle.findings };
    allFindings.push(...(bundle.findings || []));
  }
  if (memory) {
    categories['memory'] = { score: scoreSeverity(memory.findings), findings: memory.findings };
    allFindings.push(...(memory.findings || []));
  }
  if (loadtest) {
    const ltFindings = [];
    if (loadtest.errorRate && parseFloat(loadtest.errorRate) > 5) {
      ltFindings.push({ severity: 'critical', message: `High error rate: ${loadtest.errorRate}` });
    }
    if (loadtest.p99 && parseFloat(loadtest.p99) > 2000) {
      ltFindings.push({ severity: 'warning', message: `P99 latency ${loadtest.p99} exceeds 2s` });
    }
    categories['load-capacity'] = { score: scoreSeverity(ltFindings), findings: ltFindings };
    allFindings.push(...ltFindings);
  }
  if (resources) {
    categories['resources'] = { score: scoreSeverity(resources.findings), findings: resources.findings };
    allFindings.push(...(resources.findings || []));
  }
  if (runtime) {
    categories['runtime'] = { score: scoreSeverity(runtime.findings), findings: runtime.findings };
    allFindings.push(...(runtime.findings || []));
  }

  const overallScore = Object.values(categories).length > 0
    ? Math.round(Object.values(categories).reduce((a, c) => a + c.score, 0) / Object.values(categories).length)
    : 100;

  // Comparison
  let comparison = null;
  if (args.compare) {
    const prev = {};
    for (const name of ['bundle-analysis', 'memory-analysis', 'loadtest-results', 'resource-analysis', 'runtime-analysis']) {
      prev[name] = loadJSON(args.compare, name + '.json');
    }
    comparison = {};
    if (bundle && prev['bundle-analysis']) {
      comparison.bundleSize = { before: prev['bundle-analysis'].totalSize, after: bundle.totalSize,
        delta: bundle.totalSize - prev['bundle-analysis'].totalSize };
    }
    if (loadtest && prev['loadtest-results']) {
      comparison.p99 = { before: prev['loadtest-results'].p99, after: loadtest.p99 };
    }
  }

  // Top wins
  const wins = allFindings
    .filter(f => f.severity === 'critical' || f.severity === 'warning')
    .sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1))
    .slice(0, 5)
    .map(f => f.message);

  // Generate markdown
  let md = `# Performance Report\n\n`;
  md += `**Overall Score: ${overallScore}/100** ${overallScore >= 80 ? '🟢' : overallScore >= 50 ? '🟡' : '🔴'}\n\n`;

  md += `## Category Scores\n\n`;
  for (const [cat, data] of Object.entries(categories)) {
    md += `- **${cat}**: ${data.score}/100 ${data.score >= 80 ? '🟢' : data.score >= 50 ? '🟡' : '🔴'}\n`;
  }

  if (wins.length > 0) {
    md += `\n## Top Performance Wins\n\n`;
    for (let i = 0; i < wins.length; i++) {
      md += `${i + 1}. ${wins[i]}\n`;
    }
  }

  if (bundle) {
    md += `\n## Bundle Size\n\n`;
    md += `- Total: ${formatBytes(bundle.totalSize)} (gzip: ${formatBytes(bundle.totalGzipSize)})\n`;
    md += `- Files: ${bundle.totalFiles}\n`;
  }

  if (loadtest) {
    md += `\n## Load Test\n\n`;
    md += `- Requests/sec: ${loadtest.requestsPerSec}\n`;
    md += `- P99 latency: ${loadtest.p99}\n`;
    md += `- Error rate: ${loadtest.errorRate}\n`;
  }

  if (resources) {
    md += `\n## Resources\n\n`;
    md += `- Total requests: ${resources.totalRequests}\n`;
    md += `- Transfer size: ${formatBytes(resources.totalTransferSize)}\n`;
  }

  if (comparison) {
    md += `\n## Comparison\n\n`;
    if (comparison.bundleSize) {
      const d = comparison.bundleSize.delta;
      md += `- Bundle: ${formatBytes(comparison.bundleSize.before)} → ${formatBytes(comparison.bundleSize.after)} (${d > 0 ? '+' : ''}${formatBytes(d)})\n`;
    }
  }

  md += `\n## All Findings\n\n`;
  for (const f of allFindings) {
    const icon = f.severity === 'critical' ? '🔴' : f.severity === 'warning' ? '🟡' : 'ℹ️';
    md += `- ${icon} **${f.severity}**: ${f.message}\n`;
  }

  const jsonResult = { overallScore, categories, wins, comparison, findings: allFindings };

  const outDir = path.resolve(args.outputDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'perf-report.json'), JSON.stringify(jsonResult, null, 2));
  fs.writeFileSync(path.join(outDir, 'perf-report.md'), md);

  console.log(md);
  console.log(`\nReports: ${path.join(outDir, 'perf-report.json')}, ${path.join(outDir, 'perf-report.md')}`);
}

main();
