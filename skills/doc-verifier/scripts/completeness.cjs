#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputDir = args.find((a, i) => args[i - 1] === '--output-dir') || projectDir;

function findFiles(dir, ext, ignore = ['node_modules', '.git']) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (ignore.includes(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...findFiles(full, ext, ignore));
      else if (!ext || ext.some(x => e.name.endsWith(x))) results.push(full);
    }
  } catch {}
  return results;
}

function getHeadings(content) {
  return content.split('\n').filter(l => /^#{1,6}\s/.test(l)).map(l => l.replace(/^#+\s*/, '').trim().toLowerCase());
}

function main() {
  const dir = path.resolve(projectDir);
  const checks = [];
  let score = 0;
  let maxScore = 0;

  // README.md
  const readmePath = path.join(dir, 'README.md');
  const hasReadme = fs.existsSync(readmePath);
  checks.push({ check: 'README.md exists', pass: hasReadme, weight: 15 });
  maxScore += 15;
  if (hasReadme) score += 15;

  if (hasReadme) {
    const content = fs.readFileSync(readmePath, 'utf8');
    const headings = getHeadings(content);
    const sections = [
      ['Title (H1)', content.split('\n').some(l => /^#\s/.test(l)), 5],
      ['Description', content.length > 100, 5],
      ['Installation', headings.some(h => /install/i.test(h)), 10],
      ['Usage', headings.some(h => /usage|getting started|quick start/i.test(h)), 10],
      ['Examples', headings.some(h => /example|quick reference/i.test(h)) || (content.match(/```/g) || []).length >= 2, 10],
      ['License', headings.some(h => /license/i.test(h)) || fs.existsSync(path.join(dir, 'LICENSE')), 5],
    ];
    for (const [name, pass, weight] of sections) {
      checks.push({ check: `README: ${name}`, pass, weight });
      maxScore += weight;
      if (pass) score += weight;
    }
  }

  // CHANGELOG
  const hasCL = fs.existsSync(path.join(dir, 'CHANGELOG.md')) || fs.existsSync(path.join(dir, 'CHANGES.md'));
  checks.push({ check: 'CHANGELOG exists', pass: hasCL, weight: 5 });
  maxScore += 5; if (hasCL) score += 5;

  // Contributing
  const hasContrib = fs.existsSync(path.join(dir, 'CONTRIBUTING.md')) || 
    (hasReadme && getHeadings(fs.readFileSync(readmePath, 'utf8')).some(h => /contribut/i.test(h)));
  checks.push({ check: 'Contributing guide', pass: hasContrib, weight: 5 });
  maxScore += 5; if (hasContrib) score += 5;

  // .env.example
  const srcFiles = findFiles(dir, ['.js', '.cjs', '.mjs', '.ts', '.py']);
  let envUsed = false;
  for (const f of srcFiles) {
    try {
      if (/process\.env\.|os\.environ/i.test(fs.readFileSync(f, 'utf8'))) { envUsed = true; break; }
    } catch {}
  }
  if (envUsed) {
    const hasEnvExample = fs.existsSync(path.join(dir, '.env.example')) || fs.existsSync(path.join(dir, '.env.sample'));
    checks.push({ check: '.env.example (env vars documented)', pass: hasEnvExample, weight: 10 });
    maxScore += 10; if (hasEnvExample) score += 10;
  }

  // JSDoc/docstring coverage (sample check)
  const jsFiles = findFiles(dir, ['.js', '.cjs', '.mjs']);
  let exportedCount = 0, documentedCount = 0;
  for (const f of jsFiles) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const exports = (content.match(/(?:module\.exports|exports\.\w+|export\s+(?:default\s+)?(?:function|class|const))/g) || []);
      const jsdocs = (content.match(/\/\*\*[\s\S]*?\*\//g) || []);
      exportedCount += exports.length;
      documentedCount += Math.min(jsdocs.length, exports.length);
    } catch {}
  }
  if (exportedCount > 0) {
    const pct = Math.round(documentedCount / exportedCount * 100);
    const pass = pct >= 50;
    checks.push({ check: `JSDoc coverage (${pct}%)`, pass, weight: 10 });
    maxScore += 10; if (pass) score += 10;
  }

  // All markdown files in docs/
  const docsDir = path.join(dir, 'docs');
  if (fs.existsSync(docsDir)) {
    const docFiles = findFiles(docsDir, ['.md']);
    checks.push({ check: `docs/ directory (${docFiles.length} files)`, pass: docFiles.length > 0, weight: 5 });
    maxScore += 5; if (docFiles.length > 0) score += 5;
  }

  const finalScore = maxScore > 0 ? Math.round(score / maxScore * 100) : 0;

  const report = {
    timestamp: new Date().toISOString(),
    projectDir: dir,
    score: finalScore,
    maxPossible: maxScore,
    earnedPoints: score,
    checks
  };

  const outPath = path.join(path.resolve(outputDir), 'completeness-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Completeness score: ${finalScore}/100`);
  console.log(`Written to ${outPath}`);
}

if (require.main === module) main();
module.exports = { main };
