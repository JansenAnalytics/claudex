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

function getMtime(f) {
  try { return fs.statSync(f).mtime; } catch { return null; }
}

function checkPlaceholders(content) {
  const issues = [];
  const patterns = [
    [/\bTODO\b/gi, 'TODO marker'],
    [/\bFIXME\b/gi, 'FIXME marker'],
    [/\bTBD\b/gi, 'TBD placeholder'],
    [/\bComing soon\b/gi, 'Coming soon placeholder'],
    [/Lorem ipsum/gi, 'Lorem ipsum placeholder'],
    [/\bXXX\b/g, 'XXX marker'],
  ];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const [re, desc] of patterns) {
      if (re.test(lines[i])) {
        issues.push({ line: i + 1, type: 'placeholder', description: desc, text: lines[i].trim().slice(0, 100) });
      }
      re.lastIndex = 0;
    }
  }
  return issues;
}

function checkEmptySections(content) {
  const issues = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && /^#{1,6}\s/.test(lines[j])) {
        issues.push({ line: i + 1, type: 'empty-section', description: `Empty section: ${lines[i].trim()}` });
      }
    }
  }
  return issues;
}

function checkBrokenFormatting(content) {
  const issues = [];
  // Unclosed code blocks
  const fences = (content.match(/^```/gm) || []).length;
  if (fences % 2 !== 0) issues.push({ type: 'formatting', description: 'Unclosed code block (odd number of ```)' });
  // Broken table detection (lines with | but inconsistent column counts)
  const lines = content.split('\n');
  let tableStart = -1, tableCols = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const cols = line.split('|').length;
      if (tableStart === -1) { tableStart = i; tableCols = cols; }
      else if (cols !== tableCols) {
        issues.push({ line: i + 1, type: 'formatting', description: `Inconsistent table columns (expected ${tableCols - 2}, got ${cols - 2})` });
      }
    } else {
      tableStart = -1;
    }
  }
  return issues;
}

function checkVersionMismatch(dir) {
  const issues = [];
  const pkgPath = path.join(dir, 'package.json');
  const readmePath = path.join(dir, 'README.md');
  if (fs.existsSync(pkgPath) && fs.existsSync(readmePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const readme = fs.readFileSync(readmePath, 'utf8');
      if (pkg.version && readme.includes(pkg.version)) {
        // Version found in README — ok
      } else if (pkg.version) {
        // Check if any version-like string is in README
        const vRe = /\d+\.\d+\.\d+/g;
        const readmeVersions = readme.match(vRe) || [];
        if (readmeVersions.length > 0 && !readmeVersions.includes(pkg.version)) {
          issues.push({ type: 'version-mismatch', description: `package.json version ${pkg.version} not found in README (found: ${readmeVersions.join(', ')})` });
        }
      }
    } catch {}
  }
  return issues;
}

function main() {
  const dir = path.resolve(projectDir);
  const mdFiles = findFiles(dir, ['.md']);
  const srcFiles = findFiles(dir, ['.js', '.cjs', '.mjs', '.ts', '.py', '.sh']);
  const results = [];

  for (const mdFile of mdFiles) {
    const rel = path.relative(dir, mdFile);
    const mdMtime = getMtime(mdFile);
    const content = fs.readFileSync(mdFile, 'utf8');
    const entry = { file: rel, modified: mdMtime?.toISOString(), issues: [] };

    // Check if related source files are newer
    const baseName = path.basename(mdFile, '.md').toLowerCase();
    for (const src of srcFiles) {
      const srcBase = path.basename(src, path.extname(src)).toLowerCase();
      if (srcBase === baseName || path.dirname(src).includes(baseName)) {
        const srcMtime = getMtime(src);
        if (srcMtime && mdMtime && srcMtime > mdMtime) {
          entry.issues.push({
            type: 'stale',
            description: `Source ${path.relative(dir, src)} modified after doc (${srcMtime.toISOString()} > ${mdMtime.toISOString()})`
          });
        }
      }
    }

    entry.issues.push(...checkPlaceholders(content));
    entry.issues.push(...checkEmptySections(content));
    entry.issues.push(...checkBrokenFormatting(content));
    results.push(entry);
  }

  const versionIssues = checkVersionMismatch(dir);

  const totalIssues = results.reduce((s, r) => s + r.issues.length, 0) + versionIssues.length;

  const report = {
    timestamp: new Date().toISOString(),
    projectDir: dir,
    filesChecked: mdFiles.length,
    totalIssues,
    versionIssues,
    results
  };

  const outPath = path.join(path.resolve(outputDir), 'freshness-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Freshness report: ${mdFiles.length} files, ${totalIssues} issues`);
  console.log(`Written to ${outPath}`);
}

if (require.main === module) main();
module.exports = { main };
