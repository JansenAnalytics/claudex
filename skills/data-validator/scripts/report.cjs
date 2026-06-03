#!/usr/bin/env node
// report.cjs — Report Generator
'use strict';
const fs = require('fs');

function generateReport(results, opts = {}) {
  const format = opts.format || 'json';
  
  // Calculate scores
  const categories = {
    completeness: 100, validity: 100, consistency: 100, accuracy: 100, timeliness: 100, integrity: 100
  };
  
  // From schema validation
  if (results.schema) {
    const v = results.schema.validation || {};
    let totalFields = 0, passedFields = 0;
    for (const [field, info] of Object.entries(v)) {
      totalFields++;
      if (info.pass) passedFields++;
      else {
        categories.validity -= Math.min(15, (info.violations / Math.max(1, info.total)) * 100);
      }
    }
    if (totalFields) categories.validity = Math.max(0, Math.min(100, (passedFields / totalFields) * 100));
  }
  
  // From quality report
  if (results.quality) {
    const q = results.quality;
    if (q.scores) {
      if (q.scores.completeness !== undefined) categories.completeness = q.scores.completeness;
      if (q.scores.accuracy !== undefined) categories.accuracy = q.scores.accuracy;
      if (q.scores.consistency !== undefined) categories.consistency = q.scores.consistency;
      if (q.scores.timeliness !== undefined) categories.timeliness = q.scores.timeliness;
    }
  }
  
  // From integrity
  if (results.integrity) {
    const fkv = (results.integrity.foreignKeys || []).length + (results.integrity.orphans || []).length;
    if (fkv > 0) categories.integrity = Math.max(0, 100 - fkv * 10);
  }
  
  // Clamp
  for (const k of Object.keys(categories)) categories[k] = Math.max(0, Math.min(100, Math.round(categories[k])));
  const overall = Math.round(Object.values(categories).reduce((a, b) => a + b, 0) / Object.keys(categories).length);
  
  const report = { overallScore: overall, categories, details: results, timestamp: new Date().toISOString() };
  
  if (format === 'md' || format === 'markdown') return generateMarkdown(report);
  return report;
}

function generateMarkdown(report) {
  const grade = s => s >= 90 ? '🟢 A' : s >= 80 ? '🟡 B' : s >= 70 ? '🟠 C' : s >= 60 ? '🔴 D' : '⛔ F';
  let md = `# Data Quality Report\n\n`;
  md += `**Overall Score: ${report.overallScore}/100** ${grade(report.overallScore)}\n\n`;
  md += `| Category | Score | Grade |\n|----------|-------|-------|\n`;
  for (const [cat, score] of Object.entries(report.categories)) {
    md += `| ${cat.charAt(0).toUpperCase() + cat.slice(1)} | ${score}/100 | ${grade(score)} |\n`;
  }
  md += `\n---\nGenerated: ${report.timestamp}\n`;
  
  // Field details from schema validation
  if (report.details.schema && report.details.schema.validation) {
    md += `\n## Per-Field Validation\n\n| Field | Status | Violations | Nulls |\n|-------|--------|------------|-------|\n`;
    for (const [field, info] of Object.entries(report.details.schema.validation)) {
      md += `| ${field} | ${info.pass ? '✅' : '❌'} | ${info.violations} | ${info.nulls} |\n`;
    }
  }
  
  return md;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node report.cjs <results.json> [--format md|json] [--output FILE]'); process.exit(1); }
  const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : 'json';
  const outputFile = args.includes('--output') ? args[args.indexOf('--output') + 1] : null;
  
  const results = JSON.parse(fs.readFileSync(args[0], 'utf-8'));
  const output = generateReport(results, { format });
  const text = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
  
  if (outputFile) { fs.writeFileSync(outputFile, text); console.error(`Written to ${outputFile}`); }
  else console.log(text);
}

if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
module.exports = { generateReport };
