#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { analyze } = require('./analyze.cjs');

function sortedEntries(obj, limit = 10) {
  return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function generateMarkdown(data) {
  const { period, memoryAnalysis: m, events } = data;
  const lines = [];
  const p = s => lines.push(s);

  p(`# 📊 Meta-Analyst Report`);
  p(`**Period:** ${period} | **Files analyzed:** ${m.filesAnalyzed} | **Tracked events:** ${events.length}`);
  p(`**Generated:** ${new Date().toISOString().slice(0, 16)}`);
  p('');

  // Tool usage
  p('## 🔧 Tool Usage');
  const tools = sortedEntries(m.toolUsage).filter(([, v]) => v > 0);
  if (tools.length) {
    for (const [tool, count] of tools) p(`- **${tool}**: ${count} mentions`);
  } else {
    p('_No tool usage detected in logs._');
  }
  p('');

  // Errors
  p('## ❌ Error Patterns');
  const errors = sortedEntries(m.errorPatterns).filter(([, v]) => v > 0);
  if (errors.length) {
    for (const [kw, count] of errors) p(`- **${kw}**: ${count} occurrences`);
  } else {
    p('_No error patterns detected._');
  }
  p('');

  // Commands
  p('## 💻 Common Commands');
  const cmds = sortedEntries(m.commandPatterns);
  if (cmds.length) {
    for (const [cmd, count] of cmds) p(`- \`${cmd}\`: ${count}×`);
  } else {
    p('_No command patterns detected._');
  }
  p('');

  // Projects
  p('## 📁 Project Focus');
  const projects = sortedEntries(m.projectMentions);
  if (projects.length) {
    for (const [proj, count] of projects) p(`- **${proj}**: ${count} mentions`);
  } else {
    p('_No project patterns detected._');
  }
  p('');

  // Sub-agent & retry stats
  p('## 🤖 Reliability');
  p(`- Sub-agent mentions: **${m.subagentMentions}**`);
  p(`- Retry mentions: **${m.retryMentions}**`);
  p('');

  // Tracked events summary
  if (events.length) {
    p('## 📝 Tracked Events');
    const byType = {};
    for (const e of events) {
      byType[e.type] = byType[e.type] || [];
      byType[e.type].push(e);
    }
    for (const [type, evts] of Object.entries(byType).sort()) {
      p(`### ${type} (${evts.length})`);
      for (const e of evts.slice(0, 10)) {
        const dur = e.duration_minutes ? ` (${e.duration_minutes}m)` : '';
        const cat = e.category ? ` [${e.category}]` : '';
        p(`- ${e.message}${dur}${cat} — ${e.created_at}`);
      }
      if (evts.length > 10) p(`- _...and ${evts.length - 10} more_`);
    }
    p('');
  }

  // Lessons
  if (m.lessonsLearned.length) {
    p('## 💡 Lessons Learned');
    for (const l of m.lessonsLearned.slice(0, 15)) {
      p(`- ${l.text} _(${l.file})_`);
    }
    p('');
  }

  // Suggestions
  p('## 🎯 Auto-Suggestions');
  const suggestions = [];
  if (m.retryMentions > 5) suggestions.push('High retry count — investigate flaky tools or APIs');
  if ((m.errorPatterns['timeout'] || 0) > 3) suggestions.push('Frequent timeouts — consider longer timeouts or retries');
  if ((m.errorPatterns['failed'] || 0) > 5) suggestions.push('Many failures logged — review error handling');
  if (m.subagentMentions > 10) suggestions.push('Heavy sub-agent usage — verify sub-agent output quality');
  const unusedTools = Object.entries(m.toolUsage).filter(([, v]) => v === 0).map(([t]) => t);
  if (unusedTools.length) suggestions.push(`Unused tools: ${unusedTools.join(', ')} — consider if they could help`);
  if (!suggestions.length) suggestions.push('No issues detected — keep it up! 🎉');
  for (const s of suggestions) p(`- ${s}`);
  p('');

  return lines.join('\n');
}

function generateJson(data) {
  return JSON.stringify(data, null, 2);
}

function main() {
  const args = process.argv.slice(2);
  let period = 'week', format = 'markdown', outFile = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--period' && args[i+1]) period = args[++i];
    else if (args[i] === '--format' && args[i+1]) format = args[++i];
    else if (args[i] === '--out-file' && args[i+1]) outFile = args[++i];
    else if (args[i] === '--help') {
      console.log('Usage: report.cjs [--period week|month|all] [--format markdown|json] [--out-file PATH]');
      process.exit(0);
    }
  }

  const data = analyze(period);
  const output = format === 'json' ? generateJson(data) : generateMarkdown(data);

  if (outFile) {
    fs.writeFileSync(outFile, output);
    console.log(`Report written to ${outFile}`);
  } else {
    console.log(output);
  }
}

main();
