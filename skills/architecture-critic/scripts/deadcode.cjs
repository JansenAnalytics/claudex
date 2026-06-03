#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputFile = args.find((a,i) => args[i-1] === '--output') || 'deadcode-report.json';

function getFiles(dir, exts) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      if (entry.isDirectory()) results.push(...getFiles(full, exts));
      else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
    }
  } catch(e) {}
  return results;
}

function analyzeProject(absDir) {
  const files = getFiles(absDir, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
  const issues = [];
  const allExports = []; // {name, file, line}
  const allImports = new Set(); // names imported anywhere
  const allReferences = new Map(); // file -> content for cross-ref

  // First pass: collect all content
  const fileContents = new Map();
  for (const f of files) {
    fileContents.set(f, fs.readFileSync(f, 'utf8'));
  }

  // Collect exports
  for (const [file, content] of fileContents) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // module.exports.X, exports.X
      let m;
      if ((m = line.match(/(?:module\.)?exports\.(\w+)\s*=/))) {
        allExports.push({ name: m[1], file, line: i + 1 });
      }
      // export function/const/class
      if ((m = line.match(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/))) {
        allExports.push({ name: m[1], file, line: i + 1 });
      }
      // export { a, b }
      if ((m = line.match(/export\s*\{([^}]+)\}/))) {
        m[1].split(',').forEach(n => {
          const name = n.trim().split(/\s+as\s+/)[0].trim();
          if (name) allExports.push({ name, file, line: i + 1 });
        });
      }
      // export default
      if ((m = line.match(/export\s+default\s+(?:function\s+|class\s+)?(\w+)/))) {
        allExports.push({ name: m[1], file, line: i + 1, isDefault: true });
      }
    }
  }

  // Collect imports
  for (const [file, content] of fileContents) {
    const lines = content.split('\n');
    for (const line of lines) {
      // import { a, b } from ...
      let m;
      if ((m = line.match(/import\s*\{([^}]+)\}/))) {
        m[1].split(',').forEach(n => {
          const name = n.trim().split(/\s+as\s+/)[0].trim();
          if (name) allImports.add(name);
        });
      }
      // import X from ...
      if ((m = line.match(/import\s+(\w+)\s+from/))) allImports.add(m[1]);
      // require
      if ((m = line.match(/require\s*\(/))) {
        // const { a, b } = require(...)
        if ((m = line.match(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require/))) {
          m[1].split(',').forEach(n => allImports.add(n.trim().split(':')[0].trim()));
        }
        // const X = require(...)
        if ((m = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*require/))) {
          allImports.add(m[1]);
        }
      }
    }
  }

  // Dead exports: exported but never imported
  for (const exp of allExports) {
    if (!allImports.has(exp.name)) {
      // Check if referenced in other files
      let referenced = false;
      for (const [f, content] of fileContents) {
        if (f === exp.file) continue;
        if (new RegExp(`\\b${exp.name}\\b`).test(content)) { referenced = true; break; }
      }
      if (!referenced) {
        issues.push({ file: exp.file, line: exp.line, type: 'dead-export', name: exp.name, confidence: 'high', severity: 'medium' });
      }
    }
  }

  // Per-file analysis
  for (const [file, content] of fileContents) {
    const lines = content.split('\n');
    
    // Unreachable code
    for (let i = 0; i < lines.length - 1; i++) {
      const trimmed = lines[i].trim();
      if (/^(return|throw)\b/.test(trimmed) && !trimmed.endsWith(',')) {
        const next = lines[i + 1]?.trim();
        if (next && next !== '}' && next !== ')' && !next.startsWith('//') && !next.startsWith('case') && !next.startsWith('default')) {
          issues.push({ file, line: i + 2, type: 'unreachable-code', confidence: 'medium', severity: 'medium' });
        }
      }
    }

    // Unused variables (simple: const/let/var declared, never used again in file)
    const varDecls = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/(?:const|let|var)\s+(\w+)\s*=/);
      if (m && !lines[i].includes('require') && !lines[i].includes('import')) {
        varDecls.push({ name: m[1], line: i + 1 });
      }
    }
    for (const v of varDecls) {
      const afterDecl = lines.slice(v.line).join('\n');
      const re = new RegExp(`\\b${v.name}\\b`, 'g');
      const matches = afterDecl.match(re);
      if (!matches || matches.length === 0) {
        issues.push({ file, line: v.line, type: 'unused-variable', name: v.name, confidence: 'medium', severity: 'low' });
      }
    }

    // Commented-out code blocks
    let commentRun = 0;
    let commentStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('//') && /[;{}()=]/.test(trimmed)) {
        if (commentRun === 0) commentStart = i + 1;
        commentRun++;
      } else {
        if (commentRun >= 3) {
          issues.push({ file, line: commentStart, type: 'commented-code', lines: commentRun, confidence: 'medium', severity: 'low' });
        }
        commentRun = 0;
      }
    }
    if (commentRun >= 3) issues.push({ file, line: commentStart, type: 'commented-code', lines: commentRun, confidence: 'medium', severity: 'low' });

    // Empty catch blocks
    for (let i = 0; i < lines.length; i++) {
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(lines[i]) || 
          (/catch\s*\([^)]*\)\s*\{/.test(lines[i]) && lines[i+1]?.trim() === '}')) {
        issues.push({ file, line: i + 1, type: 'empty-catch', confidence: 'high', severity: 'critical' });
      }
    }

    // TODO/FIXME/HACK/XXX
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/\b(TODO|FIXME|HACK|XXX)\b:?\s*(.*)/);
      if (m) {
        issues.push({ file, line: i + 1, type: 'tech-debt-marker', marker: m[1], text: m[2].trim().substring(0, 100), confidence: 'high', severity: 'low' });
      }
    }
  }

  return { issues, fileCount: files.length };
}

function run() {
  const absDir = path.resolve(projectDir);
  const { issues, fileCount } = analyzeProject(absDir);

  const report = {
    summary: {
      filesAnalyzed: fileCount,
      totalIssues: issues.length,
      byType: {},
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 }
    },
    issues: issues.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] || 9) - (sev[b.severity] || 9);
    })
  };

  for (const i of issues) {
    report.summary.byType[i.type] = (report.summary.byType[i.type] || 0) + 1;
    report.summary.bySeverity[i.severity]++;
  }

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  console.log(`\n🔍 Dead Code Detection: ${fileCount} files analyzed`);
  console.log(`   Issues: ${report.summary.bySeverity.critical} critical, ${report.summary.bySeverity.high} high, ${report.summary.bySeverity.medium} medium, ${report.summary.bySeverity.low} low`);
  console.log(`   By type:`, report.summary.byType);
  console.log('');
  for (const i of issues) {
    const rel = path.relative(absDir, i.file);
    const extra = i.name ? ` (${i.name})` : i.marker ? ` [${i.marker}] ${i.text}` : '';
    console.log(`   ${i.severity.toUpperCase().padEnd(8)} ${rel}:${i.line} ${i.type}${extra}`);
  }
  console.log(`\nReport: ${outputFile}`);
}

run();
