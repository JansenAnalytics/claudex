#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MUTATIONS = [
  { name: 'arithmetic-plus-minus', pattern: /(\s)\+(\s)/g, replace: '$1-$2' },
  { name: 'arithmetic-minus-plus', pattern: /(\s)-(\s)/g, replace: '$1+$2' },
  { name: 'arithmetic-mul-div', pattern: /(\s)\*(\s)/g, replace: '$1/$2' },
  { name: 'comparison-gt-lt', pattern: /([^=!<>])>([^=])/g, replace: '$1<$2' },
  { name: 'comparison-lt-gt', pattern: /([^<])(<)([^=])/g, replace: '$1>$3' },
  { name: 'comparison-gte-lte', pattern: />=/g, replace: '<=' },
  { name: 'comparison-lte-gte', pattern: /<=/g, replace: '>=' },
  { name: 'comparison-eq-neq', pattern: /===/g, replace: '!==' },
  { name: 'comparison-eq2-neq2', pattern: /([^!=])={2}([^=])/g, replace: '$1!=$2' },
  { name: 'logical-and-or', pattern: /&&/g, replace: '||' },
  { name: 'logical-or-and', pattern: /\|\|/g, replace: '&&' },
  { name: 'boolean-true-false', pattern: /\btrue\b/g, replace: 'false' },
  { name: 'boolean-false-true', pattern: /\bfalse\b/g, replace: 'true' },
  { name: 'negate-conditional', pattern: /if\s*\(([^)]+)\)/g, replace: 'if(!($1))' },
];

function findSourceFiles(dir, exts = ['.js', '.mjs', '.cjs', '.ts']) {
  const results = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'coverage', '.coverage-tmp', 'dist', 'build', '__pycache__'].includes(entry.name)) continue;
        walk(full);
      } else if (exts.some(e => entry.name.endsWith(e)) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function getTestCommand(projectDir, framework) {
  const cmds = {
    jest: 'npx jest --no-coverage 2>&1',
    vitest: 'npx vitest run 2>&1',
    pytest: 'python3 -m pytest 2>&1',
    node: 'node --test 2>&1',
  };
  return cmds[framework] || cmds.jest;
}

function runTests(projectDir, framework) {
  try {
    execSync(getTestCommand(projectDir, framework), { cwd: projectDir, stdio: 'pipe', timeout: 30000 });
    return true; // tests pass
  } catch {
    return false; // tests fail
  }
}

function applyMutation(filePath, mutation) {
  const original = fs.readFileSync(filePath, 'utf8');
  const lines = original.split('\n');
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments and imports
    if (line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*') || 
        line.trim().startsWith('import ') || line.trim().startsWith('require(') || line.trim().startsWith('const ') && line.includes('require(')) continue;
    
    const mutated = line.replace(mutation.pattern, mutation.replace);
    if (mutated !== line) {
      results.push({ line: i + 1, original: line.trim(), mutated: mutated.trim(), lineIndex: i });
    }
  }
  return { original, lines, results };
}

function main() {
  const args = process.argv.slice(2);
  let projectDir = '.', framework = 'auto', maxMutations = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--framework') framework = args[++i];
    else if (args[i] === '--limit') maxMutations = parseInt(args[++i]);
    else if (!args[i].startsWith('-')) projectDir = args[i];
  }
  projectDir = path.resolve(projectDir);

  if (framework === 'auto') {
    try { framework = require('./coverage.cjs').detectFramework(projectDir); } catch { framework = 'jest'; }
  }

  console.log(`[mutate] Project: ${projectDir} | Framework: ${framework} | Limit: ${maxMutations}`);

  // Verify tests pass before mutations
  if (!runTests(projectDir, framework)) {
    console.log('[mutate] WARNING: Tests already failing before mutations. Results may be unreliable.');
  }

  const sourceFiles = findSourceFiles(path.join(projectDir, 'src'));
  if (!sourceFiles.length) {
    // Try root
    sourceFiles.push(...findSourceFiles(projectDir).filter(f => !f.includes('/test/') && !f.includes('/__tests__/')));
  }

  console.log(`[mutate] Source files: ${sourceFiles.length}`);

  const allMutants = [];
  let total = 0, killed = 0, survived = 0;

  for (const file of sourceFiles) {
    for (const mutation of MUTATIONS) {
      if (total >= maxMutations) break;
      const { original, lines, results } = applyMutation(file, mutation);
      
      for (const r of results) {
        if (total >= maxMutations) break;
        total++;

        // Apply mutation
        const mutatedLines = [...lines];
        mutatedLines[r.lineIndex] = lines[r.lineIndex].replace(mutation.pattern, mutation.replace);
        fs.writeFileSync(file, mutatedLines.join('\n'));

        const testsPass = runTests(projectDir, framework);

        // Restore
        fs.writeFileSync(file, original);

        const status = testsPass ? 'survived' : 'killed';
        if (testsPass) survived++; else killed++;

        allMutants.push({
          file: path.relative(projectDir, file),
          line: r.line,
          type: mutation.name,
          original: r.original,
          mutated: r.mutated,
          status,
        });

        const icon = testsPass ? '🧟 SURVIVED' : '💀 KILLED';
        console.log(`[mutate] ${icon} ${mutation.name} @ ${path.relative(projectDir, file)}:${r.line}`);
      }
    }
    if (total >= maxMutations) break;
  }

  const score = total > 0 ? Math.round((killed / total) * 100) : 0;
  const report = { total, killed, survived, score, mutants: allMutants };

  const outPath = path.join(projectDir, 'mutation-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[mutate] Mutation Score: ${score}% (${killed}/${total} killed)`);
  console.log(`[mutate] Output: ${outPath}`);

  if (survived > 0) {
    console.log(`\n[mutate] Surviving mutants (test gaps):`);
    allMutants.filter(m => m.status === 'survived').forEach(m => {
      console.log(`  - ${m.file}:${m.line} [${m.type}] "${m.original}" → "${m.mutated}"`);
    });
  }
}

if (require.main === module) main();
module.exports = { findSourceFiles, main };
