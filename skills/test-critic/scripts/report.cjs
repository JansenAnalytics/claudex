#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function loadJson(filePath) {
  if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return null;
}

function calculateScore(coverage, gaps, quality, mutations) {
  let score = 100;

  // Coverage impact (40 points max)
  if (coverage) {
    const avgCov = (coverage.summary.lines + coverage.summary.branches + coverage.summary.functions) / 3;
    score -= Math.max(0, (80 - avgCov) * 0.5); // Lose points below 80%
    score -= coverage.uncovered.length * 3;
    score -= coverage.happy_path_only.length * 5;
    score -= coverage.critical_low.length * 5;
  } else {
    score -= 20; // No coverage data
  }

  // Gaps impact (25 points max)
  if (gaps) {
    score -= gaps.bySeverity.high * 4;
    score -= gaps.bySeverity.medium * 2;
    score -= gaps.bySeverity.low * 0.5;
  }

  // Quality impact (20 points max)
  if (quality) {
    score -= quality.bySeverity.high * 5;
    score -= quality.bySeverity.medium * 2;
    score -= quality.bySeverity.low * 1;
  }

  // Mutation impact (15 points max)
  if (mutations) {
    const mutationPenalty = Math.max(0, (80 - mutations.score) * 0.2);
    score -= mutationPenalty;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildTopTests(gaps, mutations) {
  const suggestions = [];

  if (gaps) {
    for (const g of gaps.gaps.filter(g => g.severity === 'high').slice(0, 7)) {
      suggestions.push({ priority: 1, file: g.file, line: g.line, type: g.type, suggestion: g.suggestion });
    }
  }

  if (mutations) {
    for (const m of mutations.mutants.filter(m => m.status === 'survived').slice(0, 5)) {
      suggestions.push({
        priority: 2, file: m.file, line: m.line, type: `surviving-mutation-${m.type}`,
        suggestion: `Mutation "${m.original}" → "${m.mutated}" survived. Add test that catches this change.`,
      });
    }
  }

  if (gaps) {
    for (const g of gaps.gaps.filter(g => g.severity === 'medium').slice(0, 3)) {
      suggestions.push({ priority: 3, file: g.file, line: g.line, type: g.type, suggestion: g.suggestion });
    }
  }

  return suggestions.slice(0, 10);
}

function generateMarkdown(score, coverage, gaps, quality, mutations, topTests) {
  let md = `# Test Critic Report\n\n`;
  md += `## Test Health Score: ${score}/100 ${score >= 80 ? '✅' : score >= 50 ? '⚠️' : '🔴'}\n\n`;

  if (coverage) {
    md += `### Coverage\n`;
    md += `| Metric | Coverage |\n|--------|----------|\n`;
    md += `| Lines | ${coverage.summary.lines}% |\n`;
    md += `| Branches | ${coverage.summary.branches}% |\n`;
    md += `| Functions | ${coverage.summary.functions}% |\n`;
    md += `| Statements | ${coverage.summary.statements}% |\n\n`;
    if (coverage.happy_path_only.length) {
      md += `**⚠️ Happy-path-only files** (high line, low branch coverage):\n`;
      coverage.happy_path_only.forEach(f => { md += `- ${f.file}: ${f.lines}% lines, ${f.branches}% branches\n`; });
      md += '\n';
    }
    if (coverage.uncovered.length) {
      md += `**🔴 Completely untested files**: ${coverage.uncovered.join(', ')}\n\n`;
    }
  }

  if (mutations) {
    md += `### Mutation Testing\n`;
    md += `- **Score**: ${mutations.score}% (${mutations.killed}/${mutations.total} mutants killed)\n`;
    md += `- **Surviving mutants**: ${mutations.survived}\n\n`;
  }

  if (gaps) {
    md += `### Test Gaps\n`;
    md += `- **Total**: ${gaps.totalGaps} (${gaps.bySeverity.high} high, ${gaps.bySeverity.medium} medium)\n\n`;
  }

  if (quality) {
    md += `### Test Quality\n`;
    md += `- **Issues**: ${quality.totalIssues} (${quality.bySeverity.high} high, ${quality.bySeverity.medium} medium)\n\n`;
  }

  if (topTests.length) {
    md += `### 🎯 Top ${topTests.length} Tests to Write\n\n`;
    topTests.forEach((t, i) => {
      md += `${i + 1}. **${t.file}:${t.line}** [${t.type}]\n   ${t.suggestion}\n\n`;
    });
  }

  return md;
}

function main() {
  const args = process.argv.slice(2);
  let projectDir = '.', format = 'both';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format') format = args[++i];
    else if (!args[i].startsWith('-')) projectDir = args[i];
  }
  projectDir = path.resolve(projectDir);

  const coverage = loadJson(path.join(projectDir, 'coverage-analysis.json'));
  const gaps = loadJson(path.join(projectDir, 'test-gaps.json'));
  const quality = loadJson(path.join(projectDir, 'test-quality.json'));
  const mutations = loadJson(path.join(projectDir, 'mutation-results.json'));

  const score = calculateScore(coverage, gaps, quality, mutations);
  const topTests = buildTopTests(gaps, mutations);

  const report = { score, coverage, gaps, quality, mutations, topTests, timestamp: new Date().toISOString() };

  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(projectDir, 'test-critic-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`[report] JSON: ${jsonPath}`);
  }

  if (format === 'md' || format === 'both') {
    const md = generateMarkdown(score, coverage, gaps, quality, mutations, topTests);
    const mdPath = path.join(projectDir, 'test-critic-report.md');
    fs.writeFileSync(mdPath, md);
    console.log(`[report] Markdown: ${mdPath}`);
    console.log('\n' + md);
  }
}

if (require.main === module) main();
module.exports = { calculateScore, main };
