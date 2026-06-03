#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CRITICAL_PATTERNS = ['auth', 'payment', 'security', 'api', 'database', 'login', 'session', 'token', 'crypto'];

function detectFramework(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['jest'] || deps['@jest/core']) return 'jest';
    if (deps['vitest']) return 'vitest';
    // Check scripts
    const scripts = pkg.scripts || {};
    const testScript = scripts.test || '';
    if (testScript.includes('jest')) return 'jest';
    if (testScript.includes('vitest')) return 'vitest';
    if (testScript.includes('pytest')) return 'pytest';
    if (testScript.includes('node')) return 'node';
  }
  // Check config files
  if (fs.existsSync(path.join(projectDir, 'jest.config.js')) || fs.existsSync(path.join(projectDir, 'jest.config.ts'))) return 'jest';
  if (fs.existsSync(path.join(projectDir, 'vitest.config.js')) || fs.existsSync(path.join(projectDir, 'vitest.config.ts'))) return 'vitest';
  if (fs.existsSync(path.join(projectDir, 'pytest.ini')) || fs.existsSync(path.join(projectDir, 'pyproject.toml'))) return 'pytest';
  return 'jest'; // default
}

function runCoverage(projectDir, framework) {
  const cmds = {
    jest: 'npx jest --coverage --coverageReporters=json-summary --coverageDirectory=.coverage-tmp 2>&1',
    vitest: 'npx vitest run --coverage --reporter=json 2>&1',
    node: 'node --experimental-test-coverage --test 2>&1',
    pytest: 'python3 -m pytest --cov --cov-report=json 2>&1',
  };
  const cmd = cmds[framework] || cmds.jest;
  try {
    execSync(cmd, { cwd: projectDir, stdio: 'pipe', timeout: 120000 });
  } catch (e) {
    // Tests may fail but coverage still generated
  }
}

function parseCoverage(projectDir, framework) {
  let summaryPath, data;
  
  if (framework === 'jest') {
    // Try multiple possible locations
    const candidates = [
      path.join(projectDir, '.coverage-tmp', 'coverage-summary.json'),
      path.join(projectDir, 'coverage', 'coverage-summary.json'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) { summaryPath = c; break; }
    }
    if (!summaryPath) return null;
    data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } else if (framework === 'pytest') {
    summaryPath = path.join(projectDir, 'coverage.json');
    if (!fs.existsSync(summaryPath)) return null;
    data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  } else {
    return null;
  }
  
  return data;
}

function analyzeCoverage(rawData, projectDir) {
  const result = {
    summary: { lines: 0, branches: 0, functions: 0, statements: 0 },
    files: [],
    uncovered: [],
    critical_low: [],
    happy_path_only: [],
  };

  if (!rawData) return result;

  // Jest format
  if (rawData.total) {
    const t = rawData.total;
    result.summary = {
      lines: t.lines?.pct ?? 0,
      branches: t.branches?.pct ?? 0,
      functions: t.functions?.pct ?? 0,
      statements: t.statements?.pct ?? 0,
    };

    for (const [filePath, cov] of Object.entries(rawData)) {
      if (filePath === 'total') continue;
      const rel = path.relative(projectDir, filePath);
      const entry = {
        file: rel,
        lines: cov.lines?.pct ?? 0,
        branches: cov.branches?.pct ?? 0,
        functions: cov.functions?.pct ?? 0,
        statements: cov.statements?.pct ?? 0,
      };
      result.files.push(entry);

      if (entry.lines === 0 && entry.statements === 0) {
        result.uncovered.push(rel);
      }

      const lower = rel.toLowerCase();
      if (CRITICAL_PATTERNS.some(p => lower.includes(p)) && entry.lines < 80) {
        result.critical_low.push({ file: rel, lines: entry.lines, branches: entry.branches });
      }

      if (entry.lines > 70 && entry.branches < entry.lines - 30) {
        result.happy_path_only.push({ file: rel, lines: entry.lines, branches: entry.branches, gap: entry.lines - entry.branches });
      }
    }
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  const projectDir = path.resolve(args[0] || '.');
  let framework = args[1] || 'auto';
  if (framework === 'auto') framework = detectFramework(projectDir);
  const outputDir = args[2] || projectDir;

  console.log(`[coverage] Project: ${projectDir}`);
  console.log(`[coverage] Framework: ${framework}`);

  runCoverage(projectDir, framework);
  const rawData = parseCoverage(projectDir, framework);
  const analysis = analyzeCoverage(rawData, projectDir);

  const outPath = path.join(outputDir, 'coverage-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(analysis, null, 2));
  console.log(`[coverage] Output: ${outPath}`);
  console.log(`[coverage] Summary: lines=${analysis.summary.lines}% branches=${analysis.summary.branches}% functions=${analysis.summary.functions}%`);
  
  if (analysis.uncovered.length) console.log(`[coverage] Uncovered files: ${analysis.uncovered.join(', ')}`);
  if (analysis.happy_path_only.length) console.log(`[coverage] Happy-path-only files: ${analysis.happy_path_only.map(f => f.file).join(', ')}`);
  if (analysis.critical_low.length) console.log(`[coverage] Critical low coverage: ${analysis.critical_low.map(f => f.file).join(', ')}`);

  return analysis;
}

if (require.main === module) main();
module.exports = { detectFramework, runCoverage, parseCoverage, analyzeCoverage, main };
