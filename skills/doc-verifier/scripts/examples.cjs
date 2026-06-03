#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputDir = args.find((a, i) => args[i - 1] === '--output-dir') || projectDir;
const noExecute = args.includes('--no-execute');

function findMarkdownFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...findMarkdownFiles(full));
      else if (e.name.endsWith('.md')) results.push(full);
    }
  } catch {}
  return results;
}

function extractCodeBlocks(content, filePath) {
  const blocks = [];
  const lines = content.split('\n');
  let inBlock = false, lang = '', code = '', startLine = 0, skipNext = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().includes('<!-- skip-verify -->')) { skipNext = true; continue; }
    if (!inBlock && /^```(\w*)/.test(line)) {
      lang = RegExp.$1.toLowerCase();
      inBlock = true; code = ''; startLine = i + 1;
      continue;
    }
    if (inBlock && line.trim() === '```') {
      inBlock = false;
      if (!skipNext) blocks.push({ lang, code, startLine, file: filePath });
      skipNext = false;
      continue;
    }
    if (inBlock) code += line + '\n';
  }
  return blocks;
}

const SKIP_LANGS = new Set(['text', 'output', 'json', 'yaml', 'yml', 'xml', 'csv', 'html', 'css', 'markdown', 'md', 'diff', 'log', 'ini', 'toml', 'sql', 'graphql', '']);
const DANGEROUS = /\b(rm\s+-rf|rm\s+-r|rmdir|drop\s+|delete\s+|truncate|mkfs|dd\s+if|shutdown|reboot|kill\s+-9|pkill|format)\b/i;

function runBash(code, projectDir) {
  if (DANGEROUS.test(code)) return { pass: false, error: 'Skipped: contains dangerous command', skipped: true };
  try {
    const out = execSync(code, { cwd: projectDir, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, HOME: os.homedir() } });
    return { pass: true, output: out.toString().slice(0, 500) };
  } catch (e) {
    return { pass: false, error: (e.stderr || e.message || '').toString().slice(0, 500) };
  }
}

function runJS(code, projectDir) {
  const tmp = path.join(os.tmpdir(), `dv-${Date.now()}.js`);
  try {
    fs.writeFileSync(tmp, code);
    const out = execSync(`node "${tmp}"`, { cwd: projectDir, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { pass: true, output: out.toString().slice(0, 500) };
  } catch (e) {
    return { pass: false, error: (e.stderr || e.message || '').toString().slice(0, 500) };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function runPython(code, projectDir) {
  const tmp = path.join(os.tmpdir(), `dv-${Date.now()}.py`);
  try {
    fs.writeFileSync(tmp, code);
    const out = execSync(`python3 "${tmp}"`, { cwd: projectDir, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { pass: true, output: out.toString().slice(0, 500) };
  } catch (e) {
    return { pass: false, error: (e.stderr || e.message || '').toString().slice(0, 500) };
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function main() {
  const dir = path.resolve(projectDir);
  const files = findMarkdownFiles(dir);
  const results = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const blocks = extractCodeBlocks(content, file);
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (SKIP_LANGS.has(b.lang)) continue;
      let result = { file: path.relative(dir, b.file), blockIndex: i, language: b.lang, line: b.startLine, code: b.code.trim().slice(0, 300), pass: null, error: null };
      if (noExecute) {
        result.pass = null; result.error = 'Execution disabled (--no-execute)';
      } else if (['bash', 'sh', 'shell', 'zsh'].includes(b.lang)) {
        Object.assign(result, runBash(b.code, dir));
      } else if (['js', 'javascript', 'node'].includes(b.lang)) {
        Object.assign(result, runJS(b.code, dir));
      } else if (['python', 'python3', 'py'].includes(b.lang)) {
        Object.assign(result, runPython(b.code, dir));
      } else {
        result.pass = null; result.error = `Unsupported language: ${b.lang}`;
      }
      results.push(result);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    projectDir: dir,
    totalBlocks: results.length,
    passed: results.filter(r => r.pass === true).length,
    failed: results.filter(r => r.pass === false).length,
    skipped: results.filter(r => r.pass === null).length,
    results
  };

  const outPath = path.join(path.resolve(outputDir), 'examples-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Examples report: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped`);
  console.log(`Written to ${outPath}`);
  return report;
}

if (require.main === module) main();
module.exports = { findMarkdownFiles, extractCodeBlocks, main };
