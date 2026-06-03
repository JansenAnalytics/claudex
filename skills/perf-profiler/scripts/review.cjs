#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCRIPTS = path.join(__dirname);

function parseArgs(argv) {
  const args = { url: null, buildDir: null, quick: false, full: false, loadConcurrency: 10,
    loadDuration: 10, memoryIterations: 5, outputDir: './perf-output', compare: null };
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--build-dir') args.buildDir = argv[++i];
    else if (a === '--quick') args.quick = true;
    else if (a === '--full') args.full = true;
    else if (a === '--load-concurrency') args.loadConcurrency = parseInt(argv[++i]);
    else if (a === '--load-duration') args.loadDuration = parseInt(argv[++i]);
    else if (a === '--memory-iterations') args.memoryIterations = parseInt(argv[++i]);
    else if (a === '--output-dir') args.outputDir = argv[++i];
    else if (a === '--compare') args.compare = argv[++i];
    else if (!a.startsWith('-')) args.url = a;
    i++;
  }
  return args;
}

function run(cmd, cwd) {
  console.log(`\n▶ ${cmd}\n`);
  try {
    execSync(cmd, { cwd, stdio: 'inherit', timeout: 120000 });
    return true;
  } catch (e) {
    console.error(`  ⚠ Command failed: ${e.message}`);
    return false;
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url && !args.buildDir) {
    console.error('Usage: node review.cjs <url> [--build-dir DIR] [--quick|--full] [options]');
    process.exit(1);
  }

  const outDir = path.resolve(args.outputDir);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('🔍 PERFORMANCE REVIEW');
  console.log('═'.repeat(60));
  if (args.url) console.log(`URL: ${args.url}`);
  if (args.buildDir) console.log(`Build dir: ${args.buildDir}`);
  console.log(`Mode: ${args.full ? 'full' : args.quick ? 'quick' : 'standard'}`);
  console.log(`Output: ${outDir}\n`);

  // Bundle analysis
  if (args.buildDir) {
    run(`node ${path.join(SCRIPTS, 'bundle.cjs')} ${args.buildDir} --source-maps`, outDir);
  }

  // Resource analysis
  if (args.url) {
    run(`node ${path.join(SCRIPTS, 'resources.cjs')} ${args.url}`, outDir);
  }

  if (!args.quick) {
    // Runtime profiling
    if (args.url) {
      run(`node ${path.join(SCRIPTS, 'runtime.cjs')} ${args.url} --duration 5 --interaction scroll`, outDir);
    }

    if (args.full) {
      // Memory analysis
      if (args.url) {
        run(`node ${path.join(SCRIPTS, 'memory.cjs')} ${args.url} --iterations ${args.memoryIterations}`, outDir);
      }

      // Load test
      if (args.url) {
        run(`node ${path.join(SCRIPTS, 'loadtest.cjs')} ${args.url} --concurrency ${args.loadConcurrency} --duration ${args.loadDuration}`, outDir);
      }
    }
  }

  // Generate report
  const reportArgs = [`--input-dir`, outDir, `--output-dir`, outDir];
  if (args.compare) reportArgs.push('--compare', args.compare);
  run(`node ${path.join(SCRIPTS, 'report.cjs')} ${reportArgs.join(' ')}`, outDir);

  console.log('\n✅ Review complete! See ' + outDir);
}

main();
