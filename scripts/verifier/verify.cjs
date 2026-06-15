#!/usr/bin/env node
/*
 * verify.cjs — Cross-Model Verifier (CMV), Layer B: the INDEPENDENT non-Anthropic critic.
 *
 * Part of the double-model verification layer (see research/2026-06-14-cross-model-verifier-spec.md):
 *   Layer A = a fresh Anthropic (Claude) verifier pass (handled by the /verify skill + a Claude subagent)
 *   Layer B = THIS engine — an independent OpenAI/Azure model grades the artifact against the STATED GOAL
 *             and explicit criteria, returns a structured verdict, then the skill reconciles A vs B.
 *
 * Design constraints (why it's built this way):
 *   - Claude Code subagents cannot run non-Anthropic models, so the independent critic MUST be an external
 *     process. This is that process.
 *   - Zero-dependency Node (raw fetch, like scripts/memory-search.cjs). No npm installs.
 *   - Provider swappable OpenAI <-> Azure Foundry by config only (Azure v1 GA = same call shape; model = deployment).
 *   - Azure has NO hard spend cap, so we enforce monthly_budget_usd here via an append-only ledger.
 *   - Secrets come from env (api_key_env names the var); never stored in config or printed.
 *
 * Usage:
 *   node verify.cjs --goal "..." --criteria "a; b; c" --scope code|research|frontend|trade|general \
 *        --target <path | - | "inline text"> [--depth medium|major|code] \
 *        [--provider openai|azure-foundry] [--model <id>] [--backend api|codex] [--json]
 *
 *   --target -   reads the artifact from stdin.
 *
 * Output: one VERDICT JSON object on stdout (schema: verdict.schema.json + a `meta` block this engine adds).
 * Exit codes: 0 = ran (verdict may be pass/warn/fail), 3 = could-not-verify (error/budget), 2 = bad usage.
 *
 * Env knobs: CLAUDEX_WORKSPACE, VERIFIER_CONFIG, VERIFIER_DRYRUN=1 (no network; echo the request).
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WS = process.env.CLAUDEX_WORKSPACE || path.join(require('os').homedir(), '.claude-agent');
const CONFIG_PATH = process.env.VERIFIER_CONFIG || path.join(WS, 'config', 'verifier.json');
const SCHEMA_PATH = path.join(WS, 'scripts', 'verifier', 'verdict.schema.json');
const LEDGER_PATH = path.join(WS, 'data', 'verifier-spend.jsonl');
const DRY = process.env.VERIFIER_DRYRUN === '1';

// ── tiny arg parser ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const v = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      a[k] = v;
    }
  }
  return a;
}

function die(msg, code = 2) { process.stderr.write(msg + '\n'); process.exit(code); }

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// ── ledger / budget (the real ceiling — Azure has no native hard cap) ─────────
function monthKey(d) { return d.slice(0, 7); } // 'YYYY-MM' from an ISO string
function readLedger() {
  try {
    return fs.readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}
function spentThisMonth(nowIso) {
  const mk = monthKey(nowIso);
  return readLedger().filter(e => (e.ts || '').slice(0, 7) === mk)
                     .reduce((s, e) => s + (Number(e.cost_usd) || 0), 0);
}
function recordSpend(entry) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + '\n');
}
function priceFor(model, cfg) {
  const p = cfg.pricing_per_1m || {};
  return p[model] || p._default || { in: 2.5, out: 15 };
}
function costUsd(model, tin, tout, cfg) {
  const pr = priceFor(model, cfg);
  return (tin / 1e6) * pr.in + (tout / 1e6) * pr.out;
}

// ── prompt construction — v2: context-grounded + applicability gate + invariants ─
function renderContext(ctx) {
  if (!ctx) return '(no context profile supplied — assume internal semi-trusted input at normal scale)';
  const lines = [];
  if (ctx.name) lines.push(`profile: ${ctx.name}`);
  if (ctx.provenance) lines.push(`input provenance: ${ctx.provenance}`);
  if (ctx.trust) lines.push(`trust level: ${ctx.trust}`);
  if (ctx.threat_model) lines.push(`threat model: ${ctx.threat_model}`);
  if (ctx.scale) lines.push(`scale: ${ctx.scale}`);
  if (ctx.non_goals && ctx.non_goals.length) lines.push(`NON-GOALS (explicitly out of scope):\n  - ${ctx.non_goals.join('\n  - ')}`);
  if (ctx.invariants && ctx.invariants.length) lines.push(`INVARIANTS (never recommend a fix that violates these):\n  - ${ctx.invariants.join('\n  - ')}`);
  if (ctx.exclusions && ctx.exclusions.length) lines.push(`EXCLUDED CONCERN CLASSES (advisory unless you name a concrete reachable trigger in this context):\n  - ${ctx.exclusions.join('\n  - ')}`);
  return lines.join('\n');
}

function buildMessages({ goal, criteria, scope, target, context }) {
  const system = [
    'You are an INDEPENDENT verification critic from a different model family than the one that produced the work.',
    'Judge whether the ARTIFACT achieves the STATED GOAL and each CRITERION **in the GIVEN CONTEXT** — not in the abstract, not generic best-practice.',
    'Detect with HIGH RECALL, then CLASSIFY each finding honestly using these fields (the engine enforces the gate from them):',
    '- trigger: the specific input/condition that causes it ("none" if purely theoretical).',
    '- reachable (yes/no/uncertain): given the CONTEXT (provenance/trust/scale/threat model), can that trigger actually occur HERE? For EXCLUDED concern classes (DoS, algorithmic complexity, CPU/memory exhaustion, generic input-validation), reachable="no" UNLESS you can name a concrete reachable trigger in this deployment.',
    '- applies_in_context: does it matter for THIS goal in THIS context?',
    '- blocks_goal: does it actually prevent achieving the goal/a criterion?',
    '- tier: "blocking" ONLY if applies_in_context AND blocks_goal AND reachable!="no"; otherwise "advisory".',
    'INVARIANTS ARE SACRED: never put a fix in `fix` that would violate a stated invariant/non-goal. If the only fix would, set violates_invariant=true and describe the tension instead.',
    '`fix` is ADVISORY (optional). Do not strain to invent fixes — an unnecessary or harmful fix is worse than none.',
    'Do not rubber-stamp; but do not inflate theoretical/out-of-context issues into blockers. score_vs_goal (0-100) measures goal achievement IN CONTEXT.',
    'Return ONLY the structured verdict.'
  ].join('\n');
  const user = [
    `SCOPE: ${scope || 'general'}`,
    `\nCONTEXT (this decides which findings matter — read it carefully):\n${renderContext(context)}`,
    `\nSTATED GOAL:\n${goal}`,
    `\nEVALUATION CRITERIA:\n${(criteria && criteria.length) ? criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : '(none supplied — infer the obvious acceptance criteria from the goal and list them)'}`,
    `\nARTIFACT TO VERIFY:\n${target}`
  ].join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ── API backend (OpenAI / Azure Foundry — identical chat/completions shape) ────
async function callApi({ providerCfg, model, messages, schema, cfg }) {
  const key = process.env[providerCfg.api_key_env];
  if (!key) throw new Error(`env var ${providerCfg.api_key_env} not set (needed for provider)`);
  const url = `${providerCfg.base_url.replace(/\/$/, '')}/chat/completions`;
  const response_format = { type: 'json_schema', json_schema: { name: 'verdict', schema, strict: true } };

  const baseBody = { model, messages, response_format, max_completion_tokens: cfg.max_output_tokens || 2000 };
  // gpt-5.x reasoning models sometimes reject non-default temperature; try with, retry without.
  const attempts = [];
  if (typeof cfg.temperature === 'number') attempts.push({ ...baseBody, temperature: cfg.temperature });
  attempts.push(baseBody);

  let lastErr;
  for (const body of attempts) {
    if (DRY) return { dryrun: true, url, body };
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'api-key': key },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      lastErr = `HTTP ${resp.status}: ${text.slice(0, 300)}`;
      // retry-without-temperature only on a param error
      if (/temperature|unsupported|max_tokens/i.test(text) && body.temperature !== undefined) continue;
      throw new Error(lastErr);
    }
    const j = JSON.parse(text);
    const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error('no content in API response');
    const verdict = JSON.parse(content);
    const usage = j.usage || {};
    return { verdict, tin: usage.prompt_tokens || 0, tout: usage.completion_tokens || 0, model };
  }
  throw new Error(lastErr || 'api call failed');
}

// ── Codex backend (deep code review; provider swap via ~/.codex/config.toml) ───
// codex exec is non-interactive (no --ask-for-approval flag in v0.139); --sandbox read-only
// is the guardrail so the critic can't mutate the workspace. We capture the schema-validated
// verdict via --output-last-message (reliable) and best-effort token usage via --json.
function resolveCodexBin() {
  const cand = process.env.CODEX_BIN || path.join(require('os').homedir(), '.local', 'bin', 'codex');
  if (fs.existsSync(cand)) return cand;
  const which = spawnSync('bash', ['-lc', 'command -v codex'], { encoding: 'utf8' });
  const p = (which.stdout || '').trim();
  return p || null;
}
function callCodex({ model, messages, depthProfile }) {
  if (DRY) return { dryrun: true, backend: 'codex', model };
  const bin = resolveCodexBin();
  if (!bin) throw new Error('codex CLI not found (npm i -g @openai/codex --prefix ~/.local)');
  const outFile = path.join(require('os').tmpdir(), `codex-verdict-${process.pid}-${Date.now()}.json`);
  const prompt = messages.map(m => `[${m.role}]\n${m.content}`).join('\n\n');
  const args = ['exec', '-', '--sandbox', 'read-only', '--skip-git-repo-check', '--json',
                '--output-schema', SCHEMA_PATH, '--output-last-message', outFile];
  if (model) args.push('-m', model);
  if (depthProfile) args.push('-p', depthProfile); // e.g. 'azure'
  try {
    const r = spawnSync(bin, args, { input: prompt, encoding: 'utf8', timeout: 300000, maxBuffer: 32 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`codex exec failed (${r.status}): ${(r.stderr || r.stdout || '').slice(0, 400)}`);
    let raw;
    try { raw = fs.readFileSync(outFile, 'utf8'); } catch { raw = ''; }
    const m = raw.match(/\{[\s\S]*\}/) || (r.stdout || '').match(/\{[\s\S]*"verdict"[\s\S]*\}/);
    if (!m) throw new Error('codex returned no JSON verdict');
    // best-effort token usage from the --json event stream
    let tin = 0, tout = 0;
    for (const line of (r.stdout || '').split('\n')) {
      try {
        const ev = JSON.parse(line);
        const u = ev.usage || (ev.turn && ev.turn.usage) || (ev.item && ev.item.usage);
        if (u) { tin = u.input_tokens || u.prompt_tokens || tin; tout = u.output_tokens || u.completion_tokens || tout; }
      } catch {}
    }
    return { verdict: JSON.parse(m[0]), tin, tout, model: model || 'codex' };
  } finally {
    try { fs.unlinkSync(outFile); } catch {}
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
(async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || (!args.goal && !args.target)) {
    die('usage: verify.cjs --goal "..." --criteria "a; b" --scope code --target <path|-|text> [--depth medium|major|code] [--provider openai|azure-foundry] [--model id] [--backend api|codex] [--json]', 2);
  }
  const cfg = loadJSON(CONFIG_PATH);
  const schema = loadJSON(SCHEMA_PATH);
  const nowIso = new Date().toISOString();

  // resolve target (file | stdin | inline)
  let target = args.target;
  if (target === '-' || target === true) target = fs.readFileSync(0, 'utf8');
  else if (typeof target === 'string' && fs.existsSync(target)) target = fs.readFileSync(target, 'utf8');
  const goal = args.goal || '(goal not stated — infer from artifact, but flag that no goal was given)';
  const criteria = args.criteria && typeof args.criteria === 'string'
    ? args.criteria.split(/\s*;\s*/).filter(Boolean) : [];
  const scope = args.scope || 'general';

  // ── F1: resolve verification CONTEXT (reusable profile + inline overrides) ──
  const PROFILES_DIR = path.join(WS, 'config', 'verify-profiles');
  const profileName = args.profile || 'default';
  let context = {};
  try { context = loadJSON(path.join(PROFILES_DIR, `${profileName}.json`)); }
  catch { context = { name: `${profileName} (profile not found — minimal context)` }; }
  if (args.trust) context.trust = String(args.trust);
  if (args['threat-model']) context.threat_model = String(args['threat-model']);
  if (args.scale) context.scale = String(args.scale);
  if (args.provenance) context.provenance = String(args.provenance);
  if (typeof args.invariants === 'string') context.invariants = [...(context.invariants || []), ...args.invariants.split(/\s*;\s*/).filter(Boolean)];
  if (typeof args['non-goals'] === 'string') context.non_goals = [...(context.non_goals || []), ...args['non-goals'].split(/\s*;\s*/).filter(Boolean)];
  if (typeof args.context === 'string') context.provenance = `${context.provenance ? context.provenance + ' ' : ''}${args.context}`;

  // resolve depth → backend/model, then apply explicit overrides
  let backend = cfg.backend, model = cfg.model;
  if (args.depth && cfg.tiers && cfg.tiers[args.depth]) {
    backend = cfg.tiers[args.depth].backend || backend;
    model = cfg.tiers[args.depth].model || model;
  }
  if (args.backend) backend = args.backend;
  const provider = args.provider || cfg.provider;
  const providerCfg = (cfg.providers || {})[provider];
  if (!providerCfg) die(`unknown provider '${provider}'`, 2);
  if (args.model) model = args.model;
  else if (providerCfg.model) model = providerCfg.model; // azure deployment name

  const emit = (obj, code) => { process.stdout.write(JSON.stringify(obj, null, args.json === true ? 0 : 2) + '\n'); process.exit(code); };
  const errVerdict = (msg) => ({ verdict: 'error', score_vs_goal: 0, criteria: [], findings: [],
    summary: `COULD NOT VERIFY: ${msg}`, meta: { provider, model, backend, ts: nowIso, error: msg } });

  // budget gate (the real ceiling for Azure)
  const spent = spentThisMonth(nowIso);
  if (cfg.monthly_budget_usd && spent >= cfg.monthly_budget_usd && cfg.on_budget_exceeded !== 'warn') {
    return emit(errVerdict(`monthly budget reached ($${spent.toFixed(2)} / $${cfg.monthly_budget_usd}). Raise monthly_budget_usd or wait for next month.`), 3);
  }

  const messages = buildMessages({ goal, criteria, scope, target, context });
  try {
    let res;
    if (backend === 'codex') res = callCodex({ model, messages, depthProfile: provider === 'azure-foundry' ? 'azure' : undefined });
    else res = await callApi({ providerCfg, model, messages, schema, cfg });

    if (res.dryrun) return emit({ dryrun: true, provider, model, backend, profile: profileName, context, request: res }, 0);

    // ── F2 applicability gate + F3 invariants: the ENGINE derives the authoritative
    //    verdict from the structured fields (hard gating, not trusting model prose) ──
    const v = res.verdict || {};
    const findings = Array.isArray(v.findings) ? v.findings : [];
    for (const f of findings) {
      f.effective_tier = (f.applies_in_context === true && f.blocks_goal === true
        && f.reachable !== 'no' && f.violates_invariant !== true) ? 'blocking' : 'advisory';
    }
    const blocking = findings.filter(f => f.effective_tier === 'blocking');
    const advisory = findings.filter(f => f.effective_tier !== 'blocking');
    const invariantConflicts = findings.filter(f => f.violates_invariant === true);
    const score = Number(v.score_vs_goal) || 0;
    const engineVerdict = blocking.length ? 'fail' : ((advisory.length || score < 80) ? 'warn' : 'pass');

    const cost = costUsd(res.model, res.tin, res.tout, cfg);
    recordSpend({ ts: nowIso, provider, model: res.model, backend, scope, profile: profileName, tin: res.tin, tout: res.tout, cost_usd: Number(cost.toFixed(6)) });
    const out = {
      verdict: engineVerdict,
      score_vs_goal: v.score_vs_goal,
      criteria: v.criteria || [],
      findings,
      blocking,
      advisory,
      invariant_conflicts: invariantConflicts,
      summary: v.summary || '',
      meta: {
        provider, model: res.model, backend, profile: context.name || profileName, ts: nowIso,
        verdict_source: 'engine-gate', model_verdict: v.verdict,
        blocking_count: blocking.length, advisory_count: advisory.length, invariant_conflict_count: invariantConflicts.length,
        tokens_in: res.tin, tokens_out: res.tout, cost_usd: Number(cost.toFixed(4)),
        month_spend_usd: Number((spent + cost).toFixed(4)), budget_usd: cfg.monthly_budget_usd
      }
    };
    return emit(out, 0);
  } catch (e) {
    return emit(errVerdict(e.message), 3);
  }
})();
