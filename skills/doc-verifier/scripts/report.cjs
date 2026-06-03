#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const outputDir = args[0] || '.';
const format = args.find((a, i) => args[i - 1] === '--format') || 'md';

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function severity(issue) {
  if (!issue) return 0;
  if (issue.type === 'stale') return 2;
  if (issue.type === 'placeholder') return 1;
  if (issue.type === 'empty-section') return 1;
  if (issue.type === 'formatting') return 3;
  if (issue.type === 'version-mismatch') return 3;
  return 1;
}

function main() {
  const dir = path.resolve(outputDir);
  const examples = loadJson(path.join(dir, 'examples-report.json'));
  const links = loadJson(path.join(dir, 'links-report.json'));
  const apiDocs = loadJson(path.join(dir, 'api-docs-report.json'));
  const cliDocs = loadJson(path.join(dir, 'cli-docs-report.json'));
  const freshness = loadJson(path.join(dir, 'freshness-report.json'));
  const completeness = loadJson(path.join(dir, 'completeness-report.json'));

  // Collect all issues for prioritization
  const allIssues = [];

  if (links?.results) {
    for (const r of links.results.filter(r => !r.ok)) {
      allIssues.push({ severity: 3, category: 'links', description: `Broken link: ${r.url} in ${r.file}:${r.line}` });
    }
  }
  if (examples?.results) {
    for (const r of examples.results.filter(r => r.pass === false)) {
      allIssues.push({ severity: 2, category: 'examples', description: `Failed example in ${r.file} block ${r.blockIndex}: ${(r.error || '').slice(0, 100)}` });
    }
  }
  if (freshness?.results) {
    for (const r of freshness.results) {
      for (const issue of r.issues) {
        allIssues.push({ severity: severity(issue), category: 'freshness', description: `${r.file}: ${issue.description}` });
      }
    }
  }
  if (freshness?.versionIssues) {
    for (const issue of freshness.versionIssues) {
      allIssues.push({ severity: 3, category: 'freshness', description: issue.description });
    }
  }
  if (completeness?.checks) {
    for (const c of completeness.checks.filter(c => !c.pass)) {
      allIssues.push({ severity: 2, category: 'completeness', description: `Missing: ${c.check}` });
    }
  }
  if (cliDocs?.summary) {
    for (const f of (cliDocs.inDocsNotCli || [])) {
      allIssues.push({ severity: 2, category: 'cli-accuracy', description: `Flag ${f} documented but not in CLI` });
    }
  }
  if (apiDocs?.results) {
    for (const r of apiDocs.results.filter(r => r.exists === false)) {
      allIssues.push({ severity: 3, category: 'api-accuracy', description: `${r.method} ${r.path} documented but returns 404` });
    }
  }

  // Sort by severity desc
  allIssues.sort((a, b) => b.severity - a.severity);

  // Calculate health score
  let healthScore = 100;
  healthScore -= allIssues.filter(i => i.severity >= 3).length * 5;
  healthScore -= allIssues.filter(i => i.severity === 2).length * 3;
  healthScore -= allIssues.filter(i => i.severity === 1).length * 1;
  if (completeness) healthScore = Math.round((healthScore + completeness.score) / 2);
  healthScore = Math.max(0, Math.min(100, healthScore));

  const top10 = allIssues.slice(0, 10);

  if (format === 'json') {
    const report = { timestamp: new Date().toISOString(), healthScore, totalIssues: allIssues.length, top10, allIssues };
    const outPath = path.join(dir, 'doc-health-report.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Written to ${outPath}`);
  } else {
    let md = `# Documentation Health Report\n\n`;
    md += `**Health Score: ${healthScore}/100**\n`;
    md += `**Total Issues: ${allIssues.length}**\n`;
    md += `**Generated:** ${new Date().toISOString()}\n\n`;

    if (completeness) md += `## Completeness: ${completeness.score}/100\n\n`;
    if (links) md += `## Links: ${links.valid} valid, ${links.broken} broken\n\n`;
    if (examples) md += `## Examples: ${examples.passed} passed, ${examples.failed} failed\n\n`;
    if (freshness) md += `## Freshness: ${freshness.totalIssues} issues\n\n`;

    md += `## Top ${top10.length} Fixes Needed\n\n`;
    for (let i = 0; i < top10.length; i++) {
      const sev = top10[i].severity >= 3 ? '🔴' : top10[i].severity >= 2 ? '🟡' : '🟢';
      md += `${i + 1}. ${sev} **[${top10[i].category}]** ${top10[i].description}\n`;
    }

    const outPath = path.join(dir, 'doc-health-report.md');
    fs.writeFileSync(outPath, md);
    console.log(md);
    console.log(`Written to ${outPath}`);
  }
}

if (require.main === module) main();
module.exports = { main };
