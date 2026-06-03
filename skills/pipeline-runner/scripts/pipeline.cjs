#!/usr/bin/env node
/**
 * pipeline.cjs — Local DAG pipeline runner.
 *
 * Executes multi-step pipelines defined in YAML/JSON with:
 *   - Sequential and parallel stages
 *   - Conditional execution (if/on_fail/on_success)
 *   - Retries with backoff
 *   - Timeouts per step
 *   - Variable passing between steps
 *   - Notifications on completion/failure
 *
 * Usage:
 *   node pipeline.cjs run <pipeline.json>  [--dry-run] [--var key=value]
 *   node pipeline.cjs validate <pipeline.json>
 *   node pipeline.cjs list                          — list pipeline files
 *   node pipeline.cjs history [--limit 10]          — show recent runs
 *   node pipeline.cjs show-run <run-id>             — show run details
 *
 * Pipeline format (YAML):
 *   name: my-pipeline
 *   env:
 *     MY_VAR: value
 *   steps:
 *     - name: build
 *       run: npm run build
 *       timeout: 120
 *       retries: 2
 *       retry_delay: 5
 *     - name: test
 *       needs: [build]
 *       run: npm test
 *       on_fail: notify
 *     - name: deploy
 *       needs: [test]
 *       if: "steps.test.exitCode == 0"
 *       run: ./deploy.sh
 *     - name: parallel-checks
 *       parallel:
 *         - name: lint
 *           run: npm run lint
 *         - name: typecheck
 *           run: npm run typecheck
 *
 * Env:
 *   PIPELINE_DIR  — directory for pipeline YAML files (default: ~/.pipelines)
 *   PIPELINE_LOGS — directory for run logs (default: ~/.pipelines/runs)
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PIPELINE_DIR = process.env.PIPELINE_DIR || path.join(os.homedir(), '.pipelines');
const PIPELINE_LOGS = process.env.PIPELINE_LOGS || path.join(PIPELINE_DIR, 'runs');

// ── YAML Parser (minimal, no dependency) ──────────────────────────────────────
function parseYaml(text) {
  // Support JSON directly
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);

  // Minimal YAML parser for our pipeline format
  const lines = text.split('\n');
  const result = {};
  let currentKey = null;
  let currentList = null;
  let currentObj = null;
  let inSteps = false;
  let currentStep = null;
  let steps = [];
  let inParallel = false;
  let parallelSteps = [];
  let indent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimLine = line.replace(/\s+$/, '');
    if (!trimLine || trimLine.startsWith('#')) continue;

    const leadingSpaces = line.match(/^(\s*)/)[1].length;

    // Top-level key: value
    if (leadingSpaces === 0 && trimLine.includes(':')) {
      const [key, ...rest] = trimLine.split(':');
      const val = rest.join(':').trim();
      currentKey = key.trim();
      if (currentKey === 'steps') {
        inSteps = true;
        result.steps = steps;
        continue;
      }
      if (currentKey === 'env') {
        result.env = {};
        currentObj = result.env;
        continue;
      }
      if (val) result[currentKey] = val;
      continue;
    }

    // Env key: value
    if (currentObj && leadingSpaces >= 2 && !inSteps && trimLine.includes(':')) {
      const [k, ...v] = trimLine.trim().split(':');
      currentObj[k.trim()] = v.join(':').trim().replace(/^["']|["']$/g, '');
      continue;
    }

    // Steps parsing
    if (inSteps) {
      const stripped = trimLine.trim();

      // New step (- name: ...)
      if (stripped.startsWith('- name:')) {
        if (currentStep) {
          if (inParallel) { parallelSteps.push(currentStep); }
          else steps.push(currentStep);
        }
        if (inParallel && !stripped.startsWith('- name:')) {
          // end parallel
        }
        currentStep = { name: stripped.replace('- name:', '').trim() };
        inParallel = false;
        continue;
      }

      // Step properties
      if (currentStep && leadingSpaces >= 4) {
        if (stripped.startsWith('- name:') && inParallel) {
          if (currentStep.name) parallelSteps.push({ ...currentStep });
          currentStep = { name: stripped.replace('- name:', '').trim() };
          continue;
        }

        const [k, ...v] = stripped.replace(/^- /, '').split(':');
        const key = k.trim();
        let val = v.join(':').trim();
        // Only strip quotes from non-run keys
        if (key !== 'run') val = val.replace(/^["']|["']$/g, '');

        if (key === 'needs') {
          val = val.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
        } else if (key === 'parallel') {
          inParallel = true;
          parallelSteps = [];
          // Save current step, it becomes a parallel container
          currentStep.parallel = parallelSteps;
          continue;
        } else if (key === 'timeout' || key === 'retries' || key === 'retry_delay') {
          val = parseInt(val, 10);
        }

        if (key === 'run') {
          // Handle multi-line run with |
          if (val === '|' || val === '') {
            const runLines = [];
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j];
              const nextSpaces = nextLine.match(/^(\s*)/)[1].length;
              if (nextSpaces > leadingSpaces + 2 || (nextLine.trim() && nextSpaces >= leadingSpaces + 2)) {
                runLines.push(nextLine.trim());
                i = j;
              } else break;
            }
            val = runLines.join('\n');
          }
        }

        if (val !== undefined && val !== '') currentStep[key] = val;
        continue;
      }
    }
  }

  // Push last step
  if (currentStep) {
    if (inParallel) parallelSteps.push(currentStep);
    else steps.push(currentStep);
  }

  if (steps.length) result.steps = steps;
  return result;
}

// ── Step Executor ─────────────────────────────────────────────────────────────
function runCommand(cmd, env = {}, timeoutSec = 300) {
  const startTime = Date.now();
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf8',
      timeout: timeoutSec * 1000,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: '/bin/bash',
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      exitCode: 0,
      stdout: stdout.slice(-5000), // Keep last 5k chars
      stderr: '',
      durationMs: Date.now() - startTime,
    };
  } catch (e) {
    return {
      exitCode: e.status || 1,
      stdout: (e.stdout || '').slice(-5000),
      stderr: (e.stderr || '').slice(-2000),
      durationMs: Date.now() - startTime,
      error: e.message?.slice(0, 500),
    };
  }
}

function evaluateCondition(condition, stepResults) {
  if (!condition) return true;

  // Simple condition evaluator: "steps.NAME.exitCode == 0"
  // Normalize: try exact name first, then with hyphens/underscores swapped
  const replaced = condition.replace(/steps\.([\w-]+)\.(\w+)/g, (_, name, prop) => {
    let result = stepResults[name];
    if (!result) result = stepResults[name.replace(/_/g, '-')];
    if (!result) result = stepResults[name.replace(/-/g, '_')];
    if (!result) return 'undefined';
    return JSON.stringify(result[prop]);
  });

  try {
    return new Function(`return ${replaced}`)();
  } catch {
    console.error(`  ⚠️ Condition evaluation failed: ${condition}`);
    return false;
  }
}

async function executeStep(step, env, stepResults, dryRun = false) {
  const timeout = step.timeout || 300;
  const retries = step.retries || 0;
  const retryDelay = step.retry_delay || 5;

  // Check condition
  if (step.if && !evaluateCondition(step.if, stepResults)) {
    return { status: 'skipped', reason: `Condition not met: ${step.if}`, durationMs: 0 };
  }

  // Check dependencies
  if (step.needs) {
    for (const dep of step.needs) {
      const depResult = stepResults[dep];
      if (!depResult || depResult.status === 'failed') {
        return { status: 'skipped', reason: `Dependency "${dep}" not met`, durationMs: 0 };
      }
    }
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would execute: ${step.run}`);
    return { status: 'dry-run', durationMs: 0 };
  }

  // Execute with retries
  let result;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      console.log(`  🔄 Retry ${attempt}/${retries} after ${retryDelay}s...`);
      await new Promise(r => setTimeout(r, retryDelay * 1000));
    }

    result = runCommand(step.run, env, timeout);

    if (result.exitCode === 0) {
      return { ...result, status: 'success', attempts: attempt + 1 };
    }
  }

  // All retries exhausted
  return { ...result, status: 'failed', attempts: retries + 1 };
}

async function executeParallel(steps, env, stepResults, dryRun) {
  const promises = steps.map(s => executeStep(s, env, stepResults, dryRun));
  const results = await Promise.all(promises);
  const merged = {};
  for (let i = 0; i < steps.length; i++) {
    merged[steps[i].name] = results[i];
  }
  return merged;
}

// ── Pipeline Runner ───────────────────────────────────────────────────────────
async function runPipeline(pipeline, vars = {}, dryRun = false) {
  const runId = `${pipeline.name || 'pipeline'}-${Date.now()}`;
  const env = { ...pipeline.env, ...vars };
  const stepResults = {};
  const startTime = Date.now();

  console.log(`\n🚀 Pipeline: ${pipeline.name || 'unnamed'}`);
  console.log(`   Run ID: ${runId}`);
  console.log(`   Steps: ${pipeline.steps.length}`);
  if (dryRun) console.log('   Mode: DRY RUN');
  console.log('─'.repeat(50));

  let failed = false;

  for (const step of pipeline.steps) {
    if (step.parallel && Array.isArray(step.parallel)) {
      // Parallel execution
      console.log(`\n⏩ Parallel: ${step.name || 'parallel-group'}`);
      for (const ps of step.parallel) {
        console.log(`  ├─ ${ps.name}`);
      }
      const results = await executeParallel(step.parallel, env, stepResults, dryRun);
      let allOk = true;
      for (const [name, result] of Object.entries(results)) {
        stepResults[name] = result;
        const icon = result.status === 'success' ? '✅' : result.status === 'skipped' ? '⏭️' : result.status === 'dry-run' ? '📋' : '❌';
        console.log(`  ${icon} ${name}: ${result.status} (${result.durationMs}ms)`);
        if (result.status === 'failed') allOk = false;
      }
      // Store parallel group result
      stepResults[step.name || 'parallel'] = { status: allOk ? 'success' : 'failed' };
      if (!allOk) failed = true;
    } else {
      // Sequential execution
      console.log(`\n▶️  ${step.name}`);
      if (step.run) console.log(`   cmd: ${step.run.slice(0, 100)}`);

      const result = await executeStep(step, env, stepResults, dryRun);
      stepResults[step.name] = result;

      const icon = result.status === 'success' ? '✅' : result.status === 'skipped' ? '⏭️' : result.status === 'dry-run' ? '📋' : '❌';
      const dur = result.durationMs ? ` (${(result.durationMs / 1000).toFixed(1)}s)` : '';
      const attempts = result.attempts > 1 ? ` [${result.attempts} attempts]` : '';
      console.log(`   ${icon} ${result.status}${dur}${attempts}`);

      if (result.status === 'skipped') {
        console.log(`   Reason: ${result.reason}`);
      }
      if (result.status === 'failed') {
        if (result.stderr) console.log(`   stderr: ${result.stderr.slice(0, 200)}`);
        failed = true;

        // Handle on_fail
        if (step.on_fail === 'continue') {
          console.log('   → Continuing despite failure (on_fail: continue)');
          failed = false;
        } else if (step.on_fail === 'notify') {
          console.log('   → Failure will be reported (on_fail: notify)');
        } else if (step.on_fail !== 'continue') {
          console.log('   → Pipeline halted');
          break;
        }
      }

      // Store stdout as variable for downstream steps
      if (result.stdout) {
        env[`STEP_${step.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_OUTPUT`] = result.stdout.trim();
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const status = failed ? 'failed' : 'success';

  console.log('\n' + '─'.repeat(50));
  console.log(`${failed ? '❌' : '✅'} Pipeline ${status} in ${(totalDuration / 1000).toFixed(1)}s`);

  // Save run log
  const runLog = {
    runId,
    pipeline: pipeline.name,
    status,
    startTime: new Date(startTime).toISOString(),
    durationMs: totalDuration,
    steps: stepResults,
    dryRun,
  };

  if (!dryRun) {
    if (!fs.existsSync(PIPELINE_LOGS)) fs.mkdirSync(PIPELINE_LOGS, { recursive: true });
    fs.writeFileSync(path.join(PIPELINE_LOGS, `${runId}.json`), JSON.stringify(runLog, null, 2));
  }

  return runLog;
}

// ── Commands ──────────────────────────────────────────────────────────────────
function loadPipeline(filePath) {
  if (!fs.existsSync(filePath)) {
    // Try in PIPELINE_DIR
    const altPath = path.join(PIPELINE_DIR, filePath);
    if (fs.existsSync(altPath)) filePath = altPath;
    else if (fs.existsSync(altPath + '.yml')) filePath = altPath + '.yml';
    else if (fs.existsSync(altPath + '.json')) filePath = altPath + '.json';
    else { console.error(`Pipeline not found: ${filePath}`); process.exit(1); }
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return parseYaml(raw);
}

async function cmdRun(argv) {
  const file = argv[3];
  if (!file) { console.error('Usage: pipeline run <file.yml> [--dry-run] [--var key=value]'); process.exit(1); }

  const { opts } = parseOpts(argv, 4);
  const vars = {};
  // Parse --var key=value
  for (const [k, v] of Object.entries(opts)) {
    if (k === 'var' || k.startsWith('var-')) continue;
    if (k === 'dry-run' || k === 'dryRun') continue;
    vars[k] = v;
  }
  // Parse positional --var k=v
  for (let i = 4; i < argv.length; i++) {
    if (argv[i] === '--var' && argv[i + 1]) {
      const [k, ...v] = argv[++i].split('=');
      vars[k] = v.join('=');
    }
  }

  const pipeline = loadPipeline(file);
  const dryRun = opts['dry-run'] === true || opts.dryRun === true;
  await runPipeline(pipeline, vars, dryRun);
}

function cmdValidate(argv) {
  const file = argv[3];
  if (!file) { console.error('Usage: pipeline validate <file.yml>'); process.exit(1); }
  const pipeline = loadPipeline(file);

  const errors = [];
  if (!pipeline.steps || !Array.isArray(pipeline.steps)) errors.push('No steps defined');
  else {
    const names = new Set();
    for (const step of pipeline.steps) {
      if (!step.name) errors.push('Step missing name');
      if (names.has(step.name)) errors.push(`Duplicate step name: ${step.name}`);
      names.add(step.name);
      if (!step.run && !step.parallel) errors.push(`Step "${step.name}" has no run command or parallel block`);
      if (step.needs) {
        for (const dep of step.needs) {
          if (!names.has(dep)) errors.push(`Step "${step.name}" depends on unknown step "${dep}"`);
        }
      }
    }
  }

  if (errors.length) {
    console.log('❌ Validation failed:');
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  } else {
    console.log(`✅ Pipeline "${pipeline.name || 'unnamed'}" is valid (${pipeline.steps.length} steps)`);
  }
}

function cmdList() {
  if (!fs.existsSync(PIPELINE_DIR)) { console.log('No pipelines directory.'); return; }
  const files = fs.readdirSync(PIPELINE_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml') || f.endsWith('.json'));
  if (files.length === 0) { console.log('No pipeline files found.'); return; }
  console.log('📂 Pipelines:\n');
  for (const f of files) {
    try {
      const pipeline = parseYaml(fs.readFileSync(path.join(PIPELINE_DIR, f), 'utf8'));
      console.log(`  ${f} — ${pipeline.name || 'unnamed'} (${pipeline.steps?.length || 0} steps)`);
    } catch {
      console.log(`  ${f} — (parse error)`);
    }
  }
}

function cmdHistory(argv) {
  const { opts } = parseOpts(argv);
  const limit = parseInt(opts.limit || '10', 10);

  if (!fs.existsSync(PIPELINE_LOGS)) { console.log('No runs yet.'); return; }
  const files = fs.readdirSync(PIPELINE_LOGS)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);

  if (files.length === 0) { console.log('No runs yet.'); return; }

  console.log('📜 Recent runs:\n');
  for (const f of files) {
    try {
      const run = JSON.parse(fs.readFileSync(path.join(PIPELINE_LOGS, f), 'utf8'));
      const icon = run.status === 'success' ? '✅' : '❌';
      const dur = (run.durationMs / 1000).toFixed(1);
      console.log(`  ${icon} ${run.runId} — ${run.status} (${dur}s) — ${run.startTime}`);
    } catch {}
  }
}

function cmdShowRun(argv) {
  const runId = argv[3];
  if (!runId) { console.error('Usage: pipeline show-run <run-id>'); process.exit(1); }

  // Find the run file
  if (!fs.existsSync(PIPELINE_LOGS)) { console.error('No runs directory.'); process.exit(1); }
  const files = fs.readdirSync(PIPELINE_LOGS).filter(f => f.includes(runId));
  if (files.length === 0) { console.error(`Run "${runId}" not found.`); process.exit(1); }

  const run = JSON.parse(fs.readFileSync(path.join(PIPELINE_LOGS, files[0]), 'utf8'));
  console.log(JSON.stringify(run, null, 2));
}

function parseOpts(argv, startIdx = 3) {
  const opts = {};
  for (let i = startIdx; i < argv.length; i++) {
    if (argv[i].startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      opts[argv[i].slice(2)] = argv[++i];
    } else if (argv[i].startsWith('--')) {
      opts[argv[i].slice(2)] = true;
    }
  }
  return { opts };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === '--help') {
    console.log(`Usage: pipeline <command> [args]

Commands:
  run <file.yml> [--dry-run] [--var key=value]   — Execute a pipeline
  validate <file.yml>                             — Validate pipeline syntax
  list                                            — List pipeline files
  history [--limit 10]                            — Show recent runs
  show-run <run-id>                               — Show run details

Pipeline files: ${PIPELINE_DIR}/
Run logs: ${PIPELINE_LOGS}/`);
    process.exit(0);
  }

  const commands = { run: cmdRun, validate: cmdValidate, list: cmdList, history: cmdHistory, 'show-run': cmdShowRun };
  if (!commands[cmd]) { console.error(`Unknown command: ${cmd}`); process.exit(1); }
  await commands[cmd](process.argv);
}

main().catch(e => { console.error(e.message); process.exit(1); });
