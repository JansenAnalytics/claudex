#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputFile = args.find((a,i) => args[i-1] === '--output') || 'complexity-report.json';
const maxComplexity = parseInt(args.find((a,i) => args[i-1] === '--max-complexity') || '10');
const ignorePatterns = [];
args.forEach((a,i) => { if (args[i-1] === '--ignore') ignorePatterns.push(a); });

function getFiles(dir, exts) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') continue;
      if (ignorePatterns.some(p => full.includes(p))) continue;
      if (entry.isDirectory()) results.push(...getFiles(full, exts));
      else if (exts.some(e => entry.name.endsWith(e))) results.push(full);
    }
  } catch(e) {}
  return results;
}

function detectLanguage(file) {
  if (file.endsWith('.py')) return 'python';
  return 'javascript';
}

function extractJSFunctions(content, lines) {
  const funcs = [];
  const funcPatterns = [
    /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>/g,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(([^)]*)\)/g,
    /(\w+)\s*\(([^)]*)\)\s*\{/g, // method shorthand
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pat of funcPatterns) {
      pat.lastIndex = 0;
      let m;
      while ((m = pat.exec(line)) !== null) {
        const name = m[1];
        if (['if', 'else', 'for', 'while', 'switch', 'catch', 'return', 'new', 'throw', 'typeof', 'delete'].includes(name)) continue;
        const params = m[2] ? m[2].split(',').filter(p => p.trim()).length : 0;
        // Find function end by brace matching
        let braceCount = 0;
        let started = false;
        let endLine = i;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '{') { braceCount++; started = true; }
            if (ch === '}') braceCount--;
          }
          if (started && braceCount <= 0) { endLine = j; break; }
        }
        const body = lines.slice(i, endLine + 1);
        funcs.push({ name, startLine: i + 1, endLine: endLine + 1, params, body });
      }
    }
  }
  // Deduplicate by startLine
  const seen = new Set();
  return funcs.filter(f => {
    const key = `${f.startLine}:${f.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPyFunctions(content, lines) {
  const funcs = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)def\s+(\w+)\s*\(([^)]*)\)/);
    if (!m) continue;
    const indent = m[1].length;
    const name = m[2];
    const params = m[3] ? m[3].split(',').filter(p => p.trim() && p.trim() !== 'self').length : 0;
    let endLine = i;
    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (trimmed === '') continue;
      const lineIndent = lines[j].length - lines[j].trimStart().length;
      if (lineIndent <= indent && trimmed !== '') { endLine = j - 1; break; }
      endLine = j;
    }
    funcs.push({ name, startLine: i + 1, endLine: endLine + 1, params, body: lines.slice(i, endLine + 1) });
  }
  return funcs;
}

function cyclomaticComplexity(body, lang) {
  let cc = 1;
  const jsPatterns = [/\bif\b/g, /\belse\s+if\b/g, /\bcase\b/g, /&&/g, /\|\|/g, /\?[^:]/g, /\bfor\b/g, /\bwhile\b/g, /\bcatch\b/g];
  const pyPatterns = [/\bif\b/g, /\belif\b/g, /\band\b/g, /\bor\b/g, /\bfor\b/g, /\bwhile\b/g, /\bexcept\b/g];
  const patterns = lang === 'python' ? pyPatterns : jsPatterns;
  const text = body.join('\n');
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) cc += matches.length;
  }
  return cc;
}

function cognitiveComplexity(body, lang) {
  let score = 0;
  let nestingLevel = 0;
  const nestingKeywords = lang === 'python' 
    ? /^\s*(if|elif|else|for|while|try|except|with)\b/
    : /^\s*(if|else\s+if|else|for|while|switch|try|catch)\b/;
  const breakKeywords = /\b(return|break|continue|throw)\b/;
  
  for (const line of body) {
    if (nestingKeywords.test(line)) {
      score += 1 + nestingLevel;
      nestingLevel++;
    }
    if (breakKeywords.test(line)) score += 1;
    if (line.includes('}')) nestingLevel = Math.max(0, nestingLevel - 1);
  }
  return score;
}

function maxNestingDepth(body) {
  let maxDepth = 0, depth = 0;
  for (const line of body) {
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  return maxDepth;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const lang = detectLanguage(filePath);
  const funcs = lang === 'python' ? extractPyFunctions(content, lines) : extractJSFunctions(content, lines);
  
  const issues = [];
  const funcResults = funcs.map(f => {
    const cc = cyclomaticComplexity(f.body, lang);
    const cog = cognitiveComplexity(f.body, lang);
    const length = f.endLine - f.startLine + 1;
    const nesting = maxNestingDepth(f.body);
    
    if (cc > maxComplexity) issues.push({ type: 'high-cyclomatic', function: f.name, line: f.startLine, value: cc, threshold: maxComplexity, severity: cc > 20 ? 'critical' : 'high' });
    if (length > 50) issues.push({ type: 'long-function', function: f.name, line: f.startLine, value: length, threshold: 50, severity: length > 100 ? 'critical' : 'high' });
    if (f.params > 4) issues.push({ type: 'many-parameters', function: f.name, line: f.startLine, value: f.params, threshold: 4, severity: 'medium' });
    if (nesting > 4) issues.push({ type: 'deep-nesting', function: f.name, line: f.startLine, value: nesting, threshold: 4, severity: 'high' });
    
    return { name: f.name, line: f.startLine, cyclomatic: cc, cognitive: cog, length, params: f.params, maxNesting: nesting };
  });
  
  if (lines.length > 300) issues.push({ type: 'long-file', line: 1, value: lines.length, threshold: 300, severity: lines.length > 500 ? 'critical' : 'high' });
  
  const avgCC = funcResults.length ? funcResults.reduce((s, f) => s + f.cyclomatic, 0) / funcResults.length : 0;
  
  return {
    file: filePath,
    language: lang,
    totalLines: lines.length,
    functionCount: funcResults.length,
    averageCyclomaticComplexity: Math.round(avgCC * 100) / 100,
    functions: funcResults,
    issues
  };
}

function run() {
  const absDir = path.resolve(projectDir);
  const files = getFiles(absDir, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py']);
  if (!files.length) { console.error('No source files found in', absDir); process.exit(1); }
  
  const results = files.map(f => analyzeFile(f));
  const allIssues = results.flatMap(r => r.issues.map(i => ({ ...i, file: r.file })));
  
  const report = {
    summary: {
      filesAnalyzed: results.length,
      totalFunctions: results.reduce((s, r) => s + r.functionCount, 0),
      totalIssues: allIssues.length,
      critical: allIssues.filter(i => i.severity === 'critical').length,
      high: allIssues.filter(i => i.severity === 'high').length,
      medium: allIssues.filter(i => i.severity === 'medium').length,
    },
    files: results,
    issues: allIssues.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2 };
      return (sev[a.severity] || 3) - (sev[b.severity] || 3);
    })
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));
  
  // Console summary
  console.log(`\n🔬 Complexity Analysis: ${results.length} files, ${report.summary.totalFunctions} functions`);
  console.log(`   Issues: ${report.summary.critical} critical, ${report.summary.high} high, ${report.summary.medium} medium\n`);
  
  for (const r of results) {
    console.log(`📄 ${path.relative(absDir, r.file)} (${r.totalLines} lines, ${r.functionCount} functions)`);
    for (const f of r.functions) {
      const flags = [];
      if (f.cyclomatic > maxComplexity) flags.push(`CC=${f.cyclomatic}⚠️`);
      if (f.length > 50) flags.push(`${f.length}lines⚠️`);
      if (f.params > 4) flags.push(`${f.params}params⚠️`);
      if (f.maxNesting > 4) flags.push(`nest=${f.maxNesting}⚠️`);
      const flagStr = flags.length ? ` ${flags.join(' ')}` : '';
      console.log(`   ${f.name}() CC=${f.cyclomatic} Cog=${f.cognitive} ${f.length}lines${flagStr}`);
    }
  }
  
  console.log(`\nReport: ${outputFile}`);
}

run();
