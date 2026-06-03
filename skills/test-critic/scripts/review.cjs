#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

function parseArgs(args) {
  const opts = {
    projectDir: '.', mode: 'full', framework: 'auto',
    mutateLimit: 100, outputDir: null, compare: null, format: 'both',
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--quick': opts.mode = 'quick'; break;
      case '--full': opts.mode = 'full'; break;
      case '--framework': opts.framework = args[++i]; break;
      case '--mutate-limit': opts.mutateLimit = parseInt(args[++i]); break;
      case '--output-dir': opts.outputDir = args[++i]; break;
      case '--compare': opts.compare = args[++i]; break;
      case '--format': opts.format = args[++i]; break;
      default: if (!args[i].startsWith('-')) opts.projectDir = args[i];
    }
  }
  opts.projectDir = path.resolve(opts.projectDir);
  opts.outputDir = opts.outputDir || opts.projectDir;
  return opts;
}

function run(cmd, cwd) {
  try {
    const out = execSync(cmd, { cwd, stdio: 'pipe', timeout: 300000 });
    return out.toString();
  } catch (e) {
    return e.stdout ? e.stdout.toString() : e.message;
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const scriptsDir = __dirname;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TEST CRITIC — Full Test Audit`);
  console.log(`  Project: ${opts.projectDir}`);
  console.log(`  Mode: ${opts.mode} | Framework: ${opts.framework}`);
  console.log(`${'='.repeat(60)}\n`);

  // 1. Coverage
  console.log('📊 Running coverage analysis...');
  console.log(run(`node "${path.join(scriptsDir, 'coverage.cjs')}" "${opts.projectDir}" ${opts.framework} "${opts.outputDir}"`, opts.projectDir));

  // 2. Gaps
  console.log('🔍 Analyzing test gaps...');
  console.log(run(`node "${path.join(scriptsDir, 'gaps.cjs')}" "${opts.projectDir}" "${opts.outputDir}"`, opts.projectDir));

  // 3. Quality
  console.log('🧪 Checking test quality...');
  console.log(run(`node "${path.join(scriptsDir, 'quality.cjs')}" "${opts.projectDir}" "${opts.outputDir}"`, opts.projectDir));

  // 4. Mutation (optional, slow)
  if (opts.mode === 'full') {
    console.log('🧬 Running mutation testing...');
    console.log(run(`node "${path.join(scriptsDir, 'mutate.cjs')}" "${opts.projectDir}" --framework ${opts.framework} --limit ${opts.mutateLimit}`, opts.projectDir));
  }

  // 5. Report
  console.log('📝 Generating report...');
  console.log(run(`node "${path.join(scriptsDir, 'report.cjs')}" "${opts.outputDir}" --format ${opts.format}`, opts.projectDir));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Audit complete. Reports in: ${opts.outputDir}`);
  console.log(`${'='.repeat(60)}\n`);
}

if (require.main === module) main();
