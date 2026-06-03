#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function findFiles(dir, filter, exclude = ['node_modules', '.git', 'coverage', 'dist', 'build']) {
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (exclude.includes(entry.name)) continue;
        walk(full);
      } else if (filter(entry.name)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function analyzeSourceFile(filePath, projectDir) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const rel = path.relative(projectDir, filePath);
  const gaps = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNum = i + 1;

    // Catch blocks - error handling
    if (trimmed.match(/}\s*catch\s*\(/)) {
      const fnName = findEnclosingFunction(lines, i);
      gaps.push({
        file: rel, line: lineNum, type: 'error-handler',
        severity: 'high',
        description: `Catch block in ${fnName || 'anonymous'} at line ${lineNum}`,
        suggestion: `Add test that triggers the error path: test('${fnName || 'function'} handles error', () => { expect(() => ...).toThrow(); })`,
      });
    }

    // Null/undefined checks
    if (trimmed.match(/(?:===?\s*null|===?\s*undefined|!==?\s*null|!==?\s*undefined|\?\?|typeof\s+\w+\s*===?\s*'undefined')/)) {
      const fnName = findEnclosingFunction(lines, i);
      gaps.push({
        file: rel, line: lineNum, type: 'null-check',
        severity: 'medium',
        description: `Null/undefined check in ${fnName || 'code'} at line ${lineNum}`,
        suggestion: `Add test with null/undefined input: test('${fnName || 'function'} handles null input', () => { ... })`,
      });
    }

    // Division operations (divide by zero)
    if (trimmed.match(/\//)) {
      // More specific: look for actual division, not comments or regex
      const noStr = trimmed.replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
      if (noStr.match(/\w\s*\/\s*\w/) && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        const fnName = findEnclosingFunction(lines, i);
        gaps.push({
          file: rel, line: lineNum, type: 'division-by-zero',
          severity: 'high',
          description: `Division operation in ${fnName || 'code'} at line ${lineNum} — potential divide-by-zero`,
          suggestion: `Add test: test('${fnName || 'function'} handles division by zero', () => { expect(${fnName || 'fn'}(..., 0)).toThrow() or return Infinity/error })`,
        });
      }
    }

    // Throw statements
    if (trimmed.match(/throw\s+new\s+\w*Error/)) {
      const fnName = findEnclosingFunction(lines, i);
      gaps.push({
        file: rel, line: lineNum, type: 'thrown-error',
        severity: 'high',
        description: `Error thrown in ${fnName || 'code'} at line ${lineNum}`,
        suggestion: `Add test that triggers this throw: test('${fnName || 'function'} throws on invalid input', () => { expect(() => ...).toThrow(); })`,
      });
    }

    // Boundary conditions (comparisons with numbers)
    if (trimmed.match(/(>|<|>=|<=)\s*\d+/) && !trimmed.startsWith('//')) {
      const fnName = findEnclosingFunction(lines, i);
      const match = trimmed.match(/(>|<|>=|<=)\s*(\d+)/);
      if (match) {
        gaps.push({
          file: rel, line: lineNum, type: 'boundary-condition',
          severity: 'medium',
          description: `Boundary check (${match[1]} ${match[2]}) in ${fnName || 'code'} at line ${lineNum}`,
          suggestion: `Add boundary tests: test at value=${match[2]}, value=${parseInt(match[2])-1}, value=${parseInt(match[2])+1}`,
        });
      }
    }

    // Empty array/string checks
    if (trimmed.match(/\.length\s*(===?|!==?|>|<|>=|<=)\s*0/)) {
      const fnName = findEnclosingFunction(lines, i);
      gaps.push({
        file: rel, line: lineNum, type: 'empty-check',
        severity: 'medium',
        description: `Empty check in ${fnName || 'code'} at line ${lineNum}`,
        suggestion: `Test with empty input: test('${fnName || 'function'} handles empty input', () => { ... })`,
      });
    }
  }

  return gaps;
}

function findEnclosingFunction(lines, idx) {
  for (let i = idx; i >= 0; i--) {
    const m = lines[i].match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=|(\w+)\s*\(.*\)\s*\{|(\w+)\s*:\s*(?:function|async))/);
    if (m) return m[1] || m[2] || m[3] || m[4];
  }
  return null;
}

function crossReferenceWithTests(gaps, testFiles, projectDir) {
  // Read all test content
  const testContent = testFiles.map(f => fs.readFileSync(f, 'utf8').toLowerCase()).join('\n');
  
  return gaps.map(gap => {
    // Simple heuristic: check if gap's function name or description keywords appear in tests
    const fnName = gap.description.match(/in (\w+)/)?.[1]?.toLowerCase();
    const hasTest = fnName && testContent.includes(fnName);
    return { ...gap, hasExistingTest: !!hasTest, testedButMaybeIncomplete: hasTest };
  });
}

function main() {
  const args = process.argv.slice(2);
  const projectDir = path.resolve(args[0] || '.');
  const outputDir = args[1] || projectDir;

  console.log(`[gaps] Analyzing: ${projectDir}`);

  const srcExts = ['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx'];
  const sourceFiles = findFiles(projectDir, name => srcExts.some(e => name.endsWith(e)) && !name.includes('.test.') && !name.includes('.spec.'));
  const testFiles = findFiles(projectDir, name => name.includes('.test.') || name.includes('.spec.'));

  console.log(`[gaps] Source files: ${sourceFiles.length}, Test files: ${testFiles.length}`);

  let allGaps = [];
  for (const file of sourceFiles) {
    allGaps.push(...analyzeSourceFile(file, projectDir));
  }

  allGaps = crossReferenceWithTests(allGaps, testFiles, projectDir);

  // Sort by severity
  const sevOrder = { high: 0, medium: 1, low: 2 };
  allGaps.sort((a, b) => (sevOrder[a.severity] || 2) - (sevOrder[b.severity] || 2));

  const report = {
    totalGaps: allGaps.length,
    byType: {},
    bySeverity: { high: 0, medium: 0, low: 0 },
    gaps: allGaps,
  };

  for (const g of allGaps) {
    report.byType[g.type] = (report.byType[g.type] || 0) + 1;
    report.bySeverity[g.severity] = (report.bySeverity[g.severity] || 0) + 1;
  }

  const outPath = path.join(outputDir, 'test-gaps.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`[gaps] Found ${allGaps.length} gaps (${report.bySeverity.high} high, ${report.bySeverity.medium} medium)`);
  
  allGaps.filter(g => g.severity === 'high').forEach(g => {
    console.log(`  ⚠️  ${g.file}:${g.line} [${g.type}] ${g.description}`);
  });

  console.log(`[gaps] Output: ${outPath}`);
}

if (require.main === module) main();
module.exports = { main };
