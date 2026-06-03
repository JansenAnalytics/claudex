#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const cliCmd = args.find((a, i) => args[i - 1] === '--cli-cmd') || '';
const outputDir = args.find((a, i) => args[i - 1] === '--output-dir') || projectDir;

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

function extractDocFlags(dir) {
  const files = findMarkdownFiles(dir);
  const flags = new Set();
  const commands = new Set();
  const flagRe = /(?:^|\s)(--[\w-]+)/g;
  const cmdRe = /`([a-z][\w-]*(?:\s+[a-z][\w-]*)?)`/g;
  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = flagRe.exec(content))) flags.add(m[1]);
    while ((m = cmdRe.exec(content))) commands.add(m[1]);
  }
  return { flags: [...flags], commands: [...commands] };
}

function parseHelpOutput(helpText) {
  const flags = new Set();
  const flagRe = /(--[\w-]+)/g;
  let m;
  while ((m = flagRe.exec(helpText))) flags.add(m[1]);
  return { flags: [...flags] };
}

function main() {
  const dir = path.resolve(projectDir);
  if (!cliCmd) {
    console.log('No --cli-cmd provided. Extracting documented flags only.');
  }

  const doc = extractDocFlags(dir);
  let actual = { flags: [] };
  let helpOutput = '';

  if (cliCmd) {
    try {
      helpOutput = execSync(`${cliCmd} --help 2>&1`, { timeout: 10000, cwd: dir }).toString();
      actual = parseHelpOutput(helpOutput);
    } catch (e) {
      helpOutput = (e.stdout || e.stderr || e.message || '').toString();
      actual = parseHelpOutput(helpOutput);
    }
  }

  const docSet = new Set(doc.flags);
  const actualSet = new Set(actual.flags);
  const inDocsNotCli = doc.flags.filter(f => !actualSet.has(f));
  const inCliNotDocs = actual.flags.filter(f => !docSet.has(f));
  const matching = doc.flags.filter(f => actualSet.has(f));

  const report = {
    timestamp: new Date().toISOString(),
    projectDir: dir,
    cliCmd: cliCmd || null,
    documentedFlags: doc.flags,
    actualFlags: actual.flags,
    matching,
    inDocsNotCli,
    inCliNotDocs,
    summary: {
      documented: doc.flags.length,
      actual: actual.flags.length,
      matching: matching.length,
      removedOrRenamed: inDocsNotCli.length,
      undocumented: inCliNotDocs.length
    }
  };

  const outPath = path.join(path.resolve(outputDir), 'cli-docs-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`CLI docs: ${matching.length} matching, ${inDocsNotCli.length} in docs but not CLI, ${inCliNotDocs.length} in CLI but not docs`);
  console.log(`Written to ${outPath}`);
}

if (require.main === module) main();
module.exports = { extractDocFlags, parseHelpOutput };
