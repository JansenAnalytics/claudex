#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const glob = require('path');
const Database = require('better-sqlite3');

const HOME = require('os').homedir();
const MEMORY_DIR = path.join(HOME, '.openclaw-poe/workspace/memory');
const DB_PATH = path.join(HOME, '.meta-analyst/events.db');

// Patterns to detect
const TOOL_NAMES = ['web_search','web_fetch','exec','browser','tts','image','canvas','nodes','message','subagents','Read','Write','Edit'];
const ERROR_KEYWORDS = ['error','failed','failure','timeout','refused','crash','broken','bug','fix','retry','ENOENT','ECONNREFUSED','404','500','permission denied'];
const PROJECT_PATTERNS = [
  { re: /prop-hedge|prop.hedge/gi, name: 'prop-hedge' },
  { re: /kanban/gi, name: 'kanban' },
  { re: /brewboard/gi, name: 'brewboard' },
  { re: /deep.research/gi, name: 'deep-research' },
  { re: /meta.analyst/gi, name: 'meta-analyst' },
  { re: /searxng/gi, name: 'searxng' },
];

function getMemoryFiles(period) {
  if (!fs.existsSync(MEMORY_DIR)) return [];
  const files = fs.readdirSync(MEMORY_DIR).filter(f => f.match(/^\d{4}-\d{2}-\d{2}\.md$/)).sort();
  if (period === 'all') return files;
  
  const now = new Date();
  const cutoff = new Date(now);
  if (period === 'week') cutoff.setDate(now.getDate() - 7);
  else if (period === 'month') cutoff.setDate(now.getDate() - 30);
  else cutoff.setDate(now.getDate() - 7);

  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return files.filter(f => f.replace('.md', '') >= cutoffStr);
}

function analyzeMemoryFiles(files) {
  const results = {
    filesAnalyzed: files.length,
    toolUsage: {},
    errorPatterns: {},
    commandPatterns: {},
    projectMentions: {},
    subagentMentions: 0,
    retryMentions: 0,
    lessonsLearned: [],
    skillMentions: {},
  };

  for (const tool of TOOL_NAMES) results.toolUsage[tool] = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8');
    const lines = content.split('\n');

    // Tool usage
    for (const tool of TOOL_NAMES) {
      const re = new RegExp(`\\b${tool}\\b`, 'gi');
      const matches = content.match(re);
      if (matches) results.toolUsage[tool] += matches.length;
    }

    // Error patterns
    for (const kw of ERROR_KEYWORDS) {
      const re = new RegExp(`\\b${kw}\\b`, 'gi');
      const matches = content.match(re);
      if (matches) results.errorPatterns[kw] = (results.errorPatterns[kw] || 0) + matches.length;
    }

    // Projects
    for (const p of PROJECT_PATTERNS) {
      const matches = content.match(p.re);
      if (matches) results.projectMentions[p.name] = (results.projectMentions[p.name] || 0) + matches.length;
    }

    // Sub-agent mentions
    const saMatches = content.match(/sub.?agent/gi);
    if (saMatches) results.subagentMentions += saMatches.length;

    // Retry mentions
    const retryMatches = content.match(/\bretry\b|\bretried\b/gi);
    if (retryMatches) results.retryMentions += retryMatches.length;

    // Lessons (lines starting with "- Lesson" or containing "learned")
    for (const line of lines) {
      if (line.match(/lesson|learned|takeaway|insight/i) && line.trim().startsWith('-')) {
        results.lessonsLearned.push({ file, text: line.trim() });
      }
    }

    // Shell commands (lines with common commands)
    const cmdRe = /`((?:npm|node|git|docker|curl|cd|ls|cat|mkdir|rm|cp|mv|chmod|bash|sh|grep|find|sed|awk)\s[^`]+)`/g;
    let m;
    while ((m = cmdRe.exec(content)) !== null) {
      const cmd = m[1].split(/\s+/)[0];
      results.commandPatterns[cmd] = (results.commandPatterns[cmd] || 0) + 1;
    }
  }

  return results;
}

function getDbEvents(period) {
  if (!fs.existsSync(DB_PATH)) return [];
  const db = new Database(DB_PATH, { readonly: true });
  let sql = 'SELECT * FROM events';
  const params = [];
  if (period !== 'all') {
    const days = period === 'month' ? 30 : 7;
    sql += ` WHERE created_at >= datetime('now', ?)`;
    params.push(`-${days} days`);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params);
  db.close();
  return rows;
}

function analyze(period = 'week') {
  const files = getMemoryFiles(period);
  const memoryAnalysis = analyzeMemoryFiles(files);
  const events = getDbEvents(period);

  return { period, memoryAnalysis, events };
}

// If run directly, output JSON
if (require.main === module) {
  const args = process.argv.slice(2);
  let period = 'week';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--period' && args[i+1]) period = args[++i];
  }
  const result = analyze(period);
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { analyze, getMemoryFiles, analyzeMemoryFiles, getDbEvents };
