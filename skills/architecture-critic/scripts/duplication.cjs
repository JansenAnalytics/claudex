#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const projectDir = args[0] || '.';
const outputFile = args.find((a,i) => args[i-1] === '--output') || 'duplication-report.json';
const blockSize = parseInt(args.find((a,i) => args[i-1] === '--block-size') || '6');

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

function normalizeLine(line) {
  // Strip comments, normalize whitespace, replace variable names with placeholders
  let l = line.trim();
  if (l.startsWith('//') || l.startsWith('*') || l.startsWith('/*') || l === '') return null;
  // Skip imports/requires
  if (/^(?:import|const\s+.*=\s*require|export)/.test(l)) return null;
  // Normalize whitespace
  l = l.replace(/\s+/g, ' ');
  return l;
}

function run() {
  const absDir = path.resolve(projectDir);
  const files = getFiles(absDir, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py']);
  
  const blockMap = new Map(); // hash -> [{file, startLine, lines}]
  
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const normalized = lines.map(normalizeLine);
    
    for (let i = 0; i <= normalized.length - blockSize; i++) {
      const block = normalized.slice(i, i + blockSize);
      if (block.filter(l => l !== null).length < blockSize * 0.7) continue; // too many empty/comment lines
      
      const key = block.filter(l => l).join('\n');
      if (key.length < 30) continue; // too short
      
      const hash = crypto.createHash('md5').update(key).digest('hex');
      if (!blockMap.has(hash)) blockMap.set(hash, []);
      blockMap.get(hash).push({ file, startLine: i + 1, code: lines.slice(i, i + blockSize).map(l => l.trim()).join('\n') });
    }
  }

  const duplicates = [];
  for (const [hash, locations] of blockMap) {
    if (locations.length < 2) continue;
    // Deduplicate overlapping blocks in same file
    const unique = [];
    const seen = new Set();
    for (const loc of locations) {
      const key = `${loc.file}:${loc.startLine}`;
      if (seen.has(key)) continue;
      // Skip if overlaps with previous from same file
      const overlap = unique.some(u => u.file === loc.file && Math.abs(u.startLine - loc.startLine) < blockSize);
      if (overlap) continue;
      seen.add(key);
      unique.push(loc);
    }
    if (unique.length < 2) continue;
    
    duplicates.push({
      hash,
      locations: unique.map(l => ({ file: path.relative(absDir, l.file), line: l.startLine })),
      code: unique[0].code,
      suggestion: 'Extract to shared function/module'
    });
  }

  // Sort by number of locations (most duplicated first)
  duplicates.sort((a, b) => b.locations.length - a.locations.length);

  const report = {
    summary: {
      filesAnalyzed: files.length,
      duplicateBlocks: duplicates.length,
      blockSize,
      totalDuplicateLines: duplicates.reduce((s, d) => s + d.locations.length * blockSize, 0)
    },
    duplicates: duplicates.slice(0, 50) // top 50
  };

  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2));

  console.log(`\n📋 Duplication Detection: ${files.length} files, block size ${blockSize}`);
  console.log(`   Duplicate blocks found: ${duplicates.length}`);
  console.log(`   Estimated duplicate lines: ${report.summary.totalDuplicateLines}\n`);
  
  for (const d of duplicates.slice(0, 10)) {
    console.log(`   ${d.locations.map(l => `${l.file}:${l.line}`).join(' ↔ ')}`);
    console.log(`   ${d.code.split('\n')[0].substring(0, 80)}...`);
  }
  console.log(`\nReport: ${outputFile}`);
}

run();
