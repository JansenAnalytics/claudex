#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const inputDir = args[0] || '.';
const format = args.find((a,i) => args[i-1] === '--format') || 'json';
const outputFile = args.find((a,i) => args[i-1] === '--output') || `architecture-review.${format === 'md' ? 'md' : 'json'}`;

function loadReport(name) {
  const file = path.join(inputDir, name);
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) { return null; }
}

function scoreCategory(name, report) {
  if (!report) return { score: 100, weight: 1, issues: 0 };
  const s = report.summary || {};
  
  switch(name) {
    case 'complexity': {
      const total = s.totalIssues || 0;
      const crit = s.critical || 0;
      const high = s.high || 0;
      return { score: Math.max(0, 100 - crit * 15 - high * 8 - (total - crit - high) * 3), weight: 2, issues: total };
    }
    case 'dead-code': {
      const total = s.totalIssues || 0;
      const bs = s.bySeverity || {};
      return { score: Math.max(0, 100 - (bs.critical || 0) * 15 - (bs.high || 0) * 8 - (bs.medium || 0) * 3 - (bs.low || 0) * 1), weight: 1.5, issues: total };
    }
    case 'dependencies': {
      const circ = s.circularDependencies || 0;
      const god = s.godModules || 0;
      return { score: Math.max(0, 100 - circ * 20 - god * 10 - (s.deepChains || 0) * 5), weight: 2, issues: circ + god };
    }
    case 'consistency': {
      const incon = s.inconsistencies || 0;
      return { score: Math.max(0, 100 - incon * 12), weight: 1, issues: incon };
    }
    case 'error-handling': {
      const bs = s.bySeverity || {};
      return { score: Math.max(0, 100 - (bs.critical || 0) * 20 - (bs.high || 0) * 10 - (bs.medium || 0) * 5), weight: 2, issues: s.totalIssues || 0 };
    }
    case 'duplication': {
      const dups = s.duplicateBlocks || 0;
      return { score: Math.max(0, 100 - dups * 3), weight: 1, issues: dups };
    }
    default: return { score: 100, weight: 1, issues: 0 };
  }
}

function run() {
  const reports = {
    complexity: loadReport('complexity-report.json'),
    'dead-code': loadReport('deadcode-report.json'),
    dependencies: loadReport('dependency-graph.json'),
    consistency: loadReport('patterns-report.json'),
    'error-handling': loadReport('error-handling-report.json'),
    duplication: loadReport('duplication-report.json'),
  };

  const categories = {};
  let totalWeightedScore = 0, totalWeight = 0;

  for (const [name, report] of Object.entries(reports)) {
    const cat = scoreCategory(name, report);
    categories[name] = cat;
    totalWeightedScore += cat.score * cat.weight;
    totalWeight += cat.weight;
  }

  const healthScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 100;

  // Top 10 refactors
  const allIssues = [];
  for (const [name, report] of Object.entries(reports)) {
    if (!report) continue;
    const issues = report.issues || [];
    for (const i of issues) {
      allIssues.push({ ...i, category: name });
    }
  }
  
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  allIssues.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));
  const topRefactors = allIssues.slice(0, 10).map((i, idx) => ({
    rank: idx + 1,
    category: i.category,
    severity: i.severity,
    file: i.file,
    line: i.line,
    type: i.type,
    description: i.description || i.name || i.type
  }));

  const result = {
    healthScore,
    grade: healthScore >= 90 ? 'A' : healthScore >= 75 ? 'B' : healthScore >= 60 ? 'C' : healthScore >= 40 ? 'D' : 'F',
    categories,
    topRefactors,
    generatedAt: new Date().toISOString()
  };

  if (format === 'md') {
    let md = `# 🏗️ Architecture Review\n\n`;
    md += `**Health Score: ${healthScore}/100 (${result.grade})**\n\n`;
    md += `## Categories\n\n| Category | Score | Issues |\n|----------|-------|--------|\n`;
    for (const [name, cat] of Object.entries(categories)) {
      md += `| ${name} | ${cat.score}/100 | ${cat.issues} |\n`;
    }
    md += `\n## Top 10 Refactors\n\n`;
    for (const r of topRefactors) {
      md += `${r.rank}. **[${r.severity.toUpperCase()}]** ${r.file}:${r.line} — ${r.type}: ${r.description}\n`;
    }
    md += `\n*Generated: ${result.generatedAt}*\n`;
    fs.writeFileSync(outputFile, md);
  } else {
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  }

  // Console output
  const emoji = healthScore >= 90 ? '🟢' : healthScore >= 75 ? '🟡' : healthScore >= 60 ? '🟠' : '🔴';
  console.log(`\n${emoji} Architecture Health Score: ${healthScore}/100 (${result.grade})\n`);
  for (const [name, cat] of Object.entries(categories)) {
    const bar = '█'.repeat(Math.round(cat.score / 5)) + '░'.repeat(20 - Math.round(cat.score / 5));
    console.log(`   ${name.padEnd(16)} ${bar} ${cat.score}/100 (${cat.issues} issues)`);
  }
  
  if (topRefactors.length) {
    console.log('\n   Top refactors:');
    for (const r of topRefactors.slice(0, 5)) {
      console.log(`   ${r.rank}. [${r.severity}] ${r.file}:${r.line} — ${r.description}`);
    }
  }
  console.log(`\nReport: ${outputFile}`);
}

run();
