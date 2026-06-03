#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function findTestFiles(dir) {
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.name.match(/\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function analyzeTestFile(filePath, projectDir) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const rel = path.relative(projectDir, filePath);
  const issues = [];

  // Find test blocks
  const testBlocks = [];
  let depth = 0, blockStart = -1, blockName = '';
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    // Detect test/it blocks
    const testMatch = trimmed.match(/(?:test|it)\s*\(\s*['"`]([^'"`]*)['"`]/);
    if (testMatch) {
      blockStart = i;
      blockName = testMatch[1];
    }

    // Test naming quality
    if (testMatch) {
      const name = testMatch[1];
      if (name.match(/^test\d*$/i) || name === 'it works' || name === 'should work' || name.length < 5) {
        issues.push({
          file: rel, line: i + 1, type: 'poor-test-name',
          severity: 'low',
          description: `Test "${name}" has a non-descriptive name`,
          suggestion: `Rename to describe what behavior is being tested, e.g., "should return sum of two positive numbers"`,
        });
      }
    }

    // Hardcoded sleeps
    if (trimmed.match(/setTimeout|sleep\(|\.delay\(|await\s+new\s+Promise.*setTimeout/)) {
      issues.push({
        file: rel, line: i + 1, type: 'hardcoded-sleep',
        severity: 'medium',
        description: `Hardcoded sleep/delay in test at line ${i + 1}`,
        suggestion: `Use waitFor(), polling, or event-based assertions instead of fixed delays`,
      });
    }

    // Shared mutable state
    if (trimmed.match(/^let\s+\w+\s*=/) && !trimmed.includes('const')) {
      // Check if it's at describe level (not inside a test)
      const inDescribe = lines.slice(0, i).some(l => l.trim().match(/describe\s*\(/));
      if (inDescribe) {
        issues.push({
          file: rel, line: i + 1, type: 'shared-mutable-state',
          severity: 'medium',
          description: `Mutable variable at describe scope (line ${i + 1}) may cause order-dependent tests`,
          suggestion: `Move to beforeEach or use const. Shared mutable state makes tests order-dependent.`,
        });
      }
    }

    // Large snapshots
    if (trimmed.match(/toMatchSnapshot|toMatchInlineSnapshot/)) {
      issues.push({
        file: rel, line: i + 1, type: 'snapshot-test',
        severity: 'low',
        description: `Snapshot test at line ${i + 1} — may be auto-approved without review`,
        suggestion: `Consider targeted assertions instead of snapshots for critical behavior`,
      });
    }

    // Excessive mocking
    if (trimmed.match(/jest\.mock|vi\.mock|sinon\.stub|\.mockImplementation|\.mockReturnValue/)) {
      // Count mocks in the file
    }
  }

  // Check for tests without assertions
  const testRegex = /(?:test|it)\s*\(\s*['"`]([^'"`]*)['"`]\s*,\s*(?:async\s*)?\(\s*\)\s*=>\s*\{/g;
  let match;
  while ((match = testRegex.exec(content)) !== null) {
    const startIdx = match.index + match[0].length;
    let braces = 1, pos = startIdx;
    while (braces > 0 && pos < content.length) {
      if (content[pos] === '{') braces++;
      if (content[pos] === '}') braces--;
      pos++;
    }
    const testBody = content.slice(startIdx, pos - 1);
    
    if (!testBody.match(/expect|assert|should|toBe|toEqual|toThrow|toHaveBeenCalled|toMatch|toContain/)) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      issues.push({
        file: rel, line: lineNum, type: 'no-assertion',
        severity: 'high',
        description: `Test "${match[1]}" has no assertions`,
        suggestion: `Add expect() calls to verify behavior. A test without assertions proves nothing.`,
      });
    }
  }

  // Count mocks
  const mockCount = (content.match(/jest\.mock|vi\.mock|sinon\.(stub|mock)|\.mockImplementation|\.mockReturnValue/g) || []).length;
  const testCount = (content.match(/(?:test|it)\s*\(/g) || []).length;
  if (mockCount > testCount * 2 && mockCount > 4) {
    issues.push({
      file: rel, line: 1, type: 'excessive-mocking',
      severity: 'medium',
      description: `${mockCount} mocks for ${testCount} tests — may be testing mocks, not real code`,
      suggestion: `Reduce mocking. Tests with too many mocks verify mock behavior, not real behavior.`,
    });
  }

  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const projectDir = path.resolve(args[0] || '.');
  const outputDir = args[1] || projectDir;

  console.log(`[quality] Analyzing test quality: ${projectDir}`);

  const testFiles = findTestFiles(projectDir);
  console.log(`[quality] Test files: ${testFiles.length}`);

  let allIssues = [];
  for (const file of testFiles) {
    allIssues.push(...analyzeTestFile(file, projectDir));
  }

  const sevOrder = { high: 0, medium: 1, low: 2 };
  allIssues.sort((a, b) => (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2));

  const report = {
    totalIssues: allIssues.length,
    byType: {},
    bySeverity: { high: 0, medium: 0, low: 0 },
    issues: allIssues,
  };

  for (const i of allIssues) {
    report.byType[i.type] = (report.byType[i.type] || 0) + 1;
    report.bySeverity[i.severity] = (report.bySeverity[i.severity] || 0) + 1;
  }

  const outPath = path.join(outputDir, 'test-quality.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[quality] Found ${allIssues.length} issues (${report.bySeverity.high} high, ${report.bySeverity.medium} medium, ${report.bySeverity.low} low)`);
  allIssues.forEach(i => console.log(`  ${i.severity === 'high' ? '🔴' : i.severity === 'medium' ? '🟡' : '🔵'} ${i.file}:${i.line} [${i.type}] ${i.description}`));
  console.log(`[quality] Output: ${outPath}`);
}

if (require.main === module) main();
module.exports = { main };
