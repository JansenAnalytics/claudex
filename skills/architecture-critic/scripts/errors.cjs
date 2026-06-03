#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputFile = args.find((a,i) => args[i-1] === '--output') || 'error-handling-report.json';

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

function run() {
  const absDir = path.resolve(projectDir);
  const files = getFiles(absDir, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
  const issues = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const rel = path.relative(absDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) ||
          (/catch\s*\([^)]*\)\s*\{\s*$/.test(line) && lines[i+1]?.trim() === '}')) {
        issues.push({ file: rel, line: i + 1, type: 'empty-catch', severity: 'critical', description: 'Empty catch block swallows errors silently' });
      }

      // Catch-and-log-only
      if (/catch\s*\([^)]*\)\s*\{/.test(line)) {
        const catchBody = [];
        let braces = 0;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) { if (ch === '{') braces++; if (ch === '}') braces--; }
          catchBody.push(lines[j].trim());
          if (braces <= 0 && j > i) break;
        }
        const body = catchBody.slice(1, -1).join(' ').trim();
        if (/^console\.(log|error|warn)\s*\(/.test(body) && !body.includes('throw') && !body.includes('reject')) {
          issues.push({ file: rel, line: i + 1, type: 'catch-and-log-only', severity: 'high', description: 'Catch block only logs error without re-throwing or handling' });
        }
      }

      // .then() without .catch()
      if (/\.then\s*\(/.test(trimmed) && !content.substring(content.indexOf(trimmed)).match(/\.catch\s*\(/)) {
        // Simple heuristic: check next few lines for .catch
        const nextLines = lines.slice(i, i + 5).join(' ');
        if (!nextLines.includes('.catch')) {
          issues.push({ file: rel, line: i + 1, type: 'unhandled-promise', severity: 'medium', description: '.then() without .catch()' });
        }
      }

      // Generic throws
      if (/throw\s+new\s+Error\s*\(\s*['"`]/.test(trimmed)) {
        const msg = trimmed.match(/throw\s+new\s+Error\s*\(\s*['"`]([^'"`]*)/);
        if (msg && msg[1].length < 20 && !msg[1].includes(':')) {
          issues.push({ file: rel, line: i + 1, type: 'generic-throw', severity: 'low', description: `Generic error message: "${msg[1]}"` });
        }
      }

      // process.exit in non-entry files
      if (/process\.exit\s*\(/.test(trimmed)) {
        issues.push({ file: rel, line: i + 1, type: 'process-exit', severity: 'medium', description: 'process.exit() - may skip cleanup' });
      }

      // Callback error ignoring: (err, data) => { ... } where err not used
      const cbMatch = trimmed.match(/\(\s*(err|error)\s*,\s*\w+\s*\)\s*(?:=>|{)/);
      if (cbMatch) {
        const funcBody = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
        const errName = cbMatch[1];
        // Check if err is referenced in body beyond the parameter
        const bodyAfterDecl = funcBody.substring(funcBody.indexOf('{') + 1);
        if (!new RegExp(`\\b${errName}\\b`).test(bodyAfterDecl)) {
          issues.push({ file: rel, line: i + 1, type: 'callback-error-ignored', severity: 'high', description: `Callback error parameter '${errName}' is never checked` });
        }
      }
    }

    // Check for global error handler
    if (!content.includes('process.on') && !content.includes('uncaughtException') && !content.includes('unhandledRejection')) {
      // Only flag entry-point-looking files
      if (file.includes('index') || file.includes('main') || file.includes('app') || file.includes('server')) {
        issues.push({ file: rel, line: 1, type: 'no-global-handler', severity: 'low', description: 'No global error handler (uncaughtException/unhandledRejection)' });
      }
    }
  }

  const report = {
    summary: {
      filesAnalyzed: files.length,
      totalIssues: issues.length,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      byType: {}
    },
    issues: issues.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity] || 9) - (sev[b.severity] || 9);
    })
  };

  for (const i of issues) {
    report.summary.bySeverity[i.severity]++;
    report.summary.byType[i.type] = (report.summary.byType[i.type] || 0) + 1;
  }

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  console.log(`\n⚠️  Error Handling Audit: ${files.length} files`);
  console.log(`   Issues: ${report.summary.bySeverity.critical} critical, ${report.summary.bySeverity.high} high, ${report.summary.bySeverity.medium} medium, ${report.summary.bySeverity.low} low\n`);
  for (const i of issues) {
    console.log(`   ${i.severity.toUpperCase().padEnd(8)} ${i.file}:${i.line} ${i.type} — ${i.description}`);
  }
  console.log(`\nReport: ${outputFile}`);
}

run();
