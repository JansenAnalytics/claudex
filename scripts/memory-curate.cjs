#!/usr/bin/env node
/*
 * memory-curate.cjs — reflect over session transcripts and persist ONLY durable facts.
 * Append-only in spirit, deduped, size-aware. Runs from CRON (not a Stop hook!).
 *
 *   node memory-curate.cjs --scan [--force]   # cron mode: process new transcript bytes
 *   node memory-curate.cjs <transcript_path>  # legacy single-file mode (tests)
 *
 * ─── WHY CRON, AND WHY THE SPAWN ISOLATION IS LOAD-BEARING (2026-06-12) ────────
 * The old Stop-hook design spawned `claude -p`, which loaded the user-level telegram
 * plugin from ANY cwd. The plugin's server.ts SIGTERMs whatever PID holds bot.pid
 * (assumes a stale orphan) before taking over polling — so every curate run murdered
 * the live channel's poller. Twice removed by Kite before the root cause was found.
 * The fix is layered; do not remove any layer:
 *   1. `--setting-sources project --strict-mcp-config` → user settings (and therefore
 *      enabledPlugins) never load. Proven by decoy-pid canary test 2026-06-12.
 *   2. cwd = fresh mkdtemp dir → no project settings/hooks can be discovered either.
 *      (NEVER set cwd anywhere under ~/.claude-agent — the workspace's own project
 *      settings + SessionStart hooks would load.)
 *   3. env: TELEGRAM_STATE_DIR → empty sandbox + TELEGRAM_BOT_TOKEN deleted → even a
 *      regression that loads the plugin exits at the token check, BEFORE the pid kill.
 *   4. ANTHROPIC_API_KEY deleted → CLI uses Max OAuth = zero metered cost.
 * `--bare` is NOT usable: it skips OAuth loading → "Not logged in" (verified 2026-06-05).
 *
 * Env:
 *   MEMORY_CURATE_DRYRUN=1      -> skip the model call; use a stub fact set (tests)
 *   MEMORY_CURATE_NOWRITE=1     -> compute + print, but DON'T write memory files
 *   MEMORY_CURATE_TARGETDIR=…   -> override the memory dir (tests)
 *   MEMORY_CURATE_PROJECTS_DIR=…-> override the transcript dir to scan
 *   MEMORY_CURATE_INTERVAL_MIN=…-> throttle (default 30; 0 disables)
 *   MEMORY_CURATE_MODEL=…       -> default claude-haiku-4-5
 *   MEMORY_CURATE_CLAUDE_BIN=…  -> default ~/.local/bin/claude
 *   CLAUDEX_WORKSPACE=…         -> workspace root (default ~/.claude-agent)
 *
 * Safety: never overwrites profile core; appends under marked sections; never touches
 * CLAUDE.md. Always exits 0 (fail-open). Offsets only advance after a successful run,
 * so failed windows are retried next cron tick.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WS = process.env.CLAUDEX_WORKSPACE || path.join(os.homedir(), '.claude-agent');
const MEMDIR = process.env.MEMORY_CURATE_TARGETDIR || path.join(WS, 'memory');
const DATADIR = path.join(WS, 'data');
const DRY = process.env.MEMORY_CURATE_DRYRUN === '1';
const NOWRITE = process.env.MEMORY_CURATE_NOWRITE === '1';
const MODEL = process.env.MEMORY_CURATE_MODEL || 'claude-haiku-4-5';
const CLAUDE_BIN = process.env.MEMORY_CURATE_CLAUDE_BIN || path.join(os.homedir(), '.local', 'bin', 'claude');
// Claude Code stores transcripts under ~/.claude/projects/<cwd-slug>/ where the
// slug is the workspace path with [/.] mapped to '-'. Derive it so this stays portable.
const PROJECTS_DIR = process.env.MEMORY_CURATE_PROJECTS_DIR
  || path.join(os.homedir(), '.claude', 'projects', WS.replace(/[/.]/g, '-'));
const USER_MD = path.join(MEMDIR, 'USER.md');
const OFFSETS_FILE = path.join(DATADIR, 'memory-curate-offsets.json');
const FAILURES_FILE = path.join(DATADIR, '.memory-curate-failures');
const STAMP_FILE = path.join(DATADIR, '.memory-curate-last');

const MAX_FACTS = 6;
const MIN_MSGS = 6;            // fewer new messages than this → wait for more
const MAX_MSGS = 120;          // per-run cap; overflow is dropped (logged) not queued
const MAX_PROMPT_CHARS = 100000;
const MAX_FILES_PER_RUN = 3;
const BACKLOG_WINDOW = 256 * 1024;   // first-seen live files: start this far from EOF
const SKIP_UNSEEN_OLDER_DAYS = 2;    // first-seen stale files: mark done, don't curate
                                     // (pre-cron history was curated by the old Stop hook;
                                     //  re-curating it would stamp old facts into today's note)
const THREAD_EXPIRY_DAYS = 30;

// ── USER.md structured schema ────────────────────────────────────────────────
// Fixed sections, fixed order. Append-only in spirit: stable_facts/preferences are
// NEVER auto-removed; rolling sections trim to newest-N; contradictions land as NEW
// recent_corrections entries. open_threads additionally supports model-driven
// resolution + age expiry (it describes in-flight work, not accumulated truth).
const PROFILE_SECTIONS = ['stable_facts', 'preferences', 'working_patterns', 'recent_corrections', 'open_threads'];
const ROLLING = { recent_corrections: 8, open_threads: 6 };
const PROFILE_CHAR_CAP = 2000; // ~500 tokens — the Hermes budget, enforced
const PROFILE_HEADER =
  '# User Profile (auto-curated — review periodically)\n' +
  '<!-- Schema: stable_facts | preferences | working_patterns | recent_corrections | open_threads.\n' +
  '     Hard cap ~500 tokens. Auto-maintained by memory-curate.cjs; review/prune via /whoami. -->\n';

const log = (...a) => console.log('[memory-curate]', ...a);

function parseProfile(text) {
  const sections = {};
  for (const s of PROFILE_SECTIONS) sections[s] = [];
  if (!text || !text.trim()) return { sections, schema: false };
  const hasSchema = PROFILE_SECTIONS.some(s => new RegExp(`^##\\s+${s}\\b`, 'm').test(text));
  if (!hasSchema) {
    for (const ln of text.split('\n')) {
      if (/^\s*-\s+\S/.test(ln)) sections.preferences.push(ln.replace(/\s+$/, ''));
    }
    return { sections, schema: false };
  }
  let cur = null;
  for (const ln of text.split('\n')) {
    const m = ln.match(/^##\s+(\w+)/);
    if (m && PROFILE_SECTIONS.includes(m[1])) { cur = m[1]; continue; }
    if (cur && /^\s*-\s+\S/.test(ln)) sections[cur].push(ln.replace(/\s+$/, ''));
  }
  return { sections, schema: true };
}

function renderProfile(sections) {
  let out = PROFILE_HEADER;
  for (const s of PROFILE_SECTIONS) {
    out += `\n## ${s}\n`;
    for (const ln of sections[s]) out += `${ln}\n`;
  }
  return out;
}

// Extract user/assistant message lines from raw transcript JSONL text.
function parseMessages(raw) {
  const msgs = [];
  for (const ln of raw.split('\n')) {
    if (!ln.trim()) continue;
    let o; try { o = JSON.parse(ln); } catch { continue; }
    const role = o.role || (o.message && o.message.role) || o.type;
    if (role !== 'user' && role !== 'assistant') continue;
    const content = o.content != null ? o.content : (o.message && o.message.content);
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content.map(c => (typeof c === 'string' ? c : (c && c.type === 'text' ? c.text : ''))).filter(Boolean).join(' ');
    }
    text = (text || '').trim();
    if (text) msgs.push(`${role}: ${text.slice(0, 1200)}`);
  }
  return msgs;
}

function readTranscriptTail(p, maxMsgs = 40) {
  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch { return ''; }
  return parseMessages(raw).slice(-maxMsgs).join('\n');
}

// "Already known" digest: the About-Aksel section of CLAUDE.md is loaded into every
// session anyway — re-recording it in USER.md wastes the 500-token budget.
function knownFactsDigest() {
  try {
    const md = fs.readFileSync(path.join(WS, 'CLAUDE.md'), 'utf8');
    const m = md.match(/^## About\b[\s\S]*?(?=^## )/m);  // the "## About <user>" section
    return m ? m[0].trim().slice(0, 800) : '';
  } catch { return ''; }
}

// ── model reflection ─────────────────────────────────────────────────────────
// Returns { ok: true, facts: [...] } or { ok: false, err } — callers must NOT
// advance offsets on ok:false (the window will be retried next run).
function reflect(tail, currentProfile) {
  if (DRY) {
    return { ok: true, facts: [
      { target: 'user', section: 'preferences', text: 'Prefers action over asking permission', evidence: 'dryrun stub' },
      { target: 'user', section: 'stable_facts', text: 'Timezone is Europe/Oslo (CET/CEST)', evidence: 'dryrun stub' },
      { target: 'user', section: 'recent_corrections', text: 'Correction: use feature branches, do NOT push to main', evidence: 'dryrun stub correction' },
      { target: 'user', section: 'preferences', text: '', evidence: 'no-evidence stub (should be dropped)' },
      { target: 'project', text: 'Stub project milestone for dryrun', evidence: 'dryrun stub' },
    ] };
  }
  const profileBlock = (currentProfile && currentProfile.trim())
    ? `\n\nCURRENT USER PROFILE (do NOT repeat facts already present; if a new fact CONTRADICTS or UPDATES one of these, set its section to "recent_corrections"; if the transcript shows an open_threads item below is FINISHED or ABANDONED, return {"target":"user","section":"open_threads","action":"resolve","text":"<the thread text>"}):\n${currentProfile.trim().slice(0, 1500)}`
    : '';
  const known = knownFactsDigest();
  const knownBlock = known
    ? `\n\nALREADY KNOWN (lives in CLAUDE.md, loaded every session — NEVER re-record these or trivial variants of them):\n${known}`
    : '';
  const prompt =
`Review this session transcript excerpt and extract ONLY durable facts worth persisting across FUTURE sessions:
- stated user preferences, environment/tooling facts, explicit corrections, project conventions, or completed-work milestones.
SKIP anything trivial, ephemeral, or easily re-discoverable. SKIP trade calls, market opinions, price levels, forecasts, and one-off P&L numbers — the trade journal owns those. SKIP routine status/acknowledgement chatter. Be conservative: prefer fewer, higher-quality facts.

Return ONLY a JSON array (max ${MAX_FACTS}) of objects:
  {"target":"user"|"project"|"entity", "text":"concise fact", "evidence":"short why/quote", "section":"<see below>"}
For target=="user" you MUST include "section", one of:
  - stable_facts        : identity, timezone, environment, tooling — rarely change
  - preferences         : how the user likes work done
  - working_patterns    : recurring workflows, cadences, routines
  - recent_corrections  : an explicit correction, OR a fact that contradicts/updates the CURRENT USER PROFILE below
  - open_threads        : in-flight work to resume later
Every "user" fact MUST have non-empty "evidence" (a quote or clear reason) — facts without evidence will be discarded.
For non-user targets, "section" is ignored. If nothing durable, return [].${knownBlock}${profileBlock}

TRANSCRIPT EXCERPT:
${tail}`;
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;     // Max OAuth, zero metered cost
    delete env.TELEGRAM_BOT_TOKEN;    // isolation layer 3 (see header)
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-curate-'));
    const tgSandbox = path.join(sandbox, 'tg-state');
    fs.mkdirSync(tgSandbox, { recursive: true });
    env.TELEGRAM_STATE_DIR = tgSandbox;
    let r;
    try {
      r = spawnSync(CLAUDE_BIN,
        ['-p', '--model', MODEL, '--setting-sources', 'project', '--strict-mcp-config'],
        { input: prompt, cwd: sandbox, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    } finally {
      try { fs.rmSync(sandbox, { recursive: true, force: true }); } catch {}
    }
    if (r.error) { log('claude -p spawn failed:', r.error.message); return { ok: false, err: r.error.message }; }
    if (r.status !== 0) {
      const err = `exit ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}`;
      log('claude -p', err); return { ok: false, err };
    }
    const m = (r.stdout || '').match(/\[[\s\S]*\]/);
    if (!m) return { ok: true, facts: [] };  // model answered, found nothing → genuine no-facts
    const arr = JSON.parse(m[0]);
    return { ok: true, facts: Array.isArray(arr) ? arr.slice(0, MAX_FACTS) : [] };
  } catch (e) { log('reflect failed:', e.message); return { ok: false, err: e.message }; }
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function alreadyHas(file, text) {
  try { return norm(fs.readFileSync(file, 'utf8')).includes(norm(text)); } catch { return false; }
}

// One "## 🧠 Auto-curated" section per day; bullets appended into the day's note.
function appendDailyNote(facts) {
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(MEMDIR, `${day}.md`);
  const fresh = facts.filter(f => f.text && !alreadyHas(file, f.text));
  if (!fresh.length) return 0;
  const hasHeader = (() => { try { return fs.readFileSync(file, 'utf8').includes('## 🧠 Auto-curated'); } catch { return false; } })();
  let block = hasHeader ? '' : '\n## 🧠 Auto-curated\n';
  for (const f of fresh) block += `- _[${f.target}]_ ${f.text}${f.evidence ? `  — ${f.evidence}` : ''}\n`;
  if (NOWRITE) { log('NOWRITE daily-note +', fresh.length); return fresh.length; }
  fs.mkdirSync(MEMDIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, `# ${day}\n`);
  fs.appendFileSync(file, block);
  return fresh.length;
}

function lineAgeDays(line) {
  const m = line.match(/<!--\s*(\d{4}-\d{2}-\d{2})\s*-->/);
  if (!m) return null;
  const age = (Date.now() - new Date(m[1]).getTime()) / 86400000;
  return Number.isFinite(age) ? age : null;
}

// Route user facts into schema sections. Guards: evidence-required, date provenance,
// contradiction-safe (corrections are new entries), hard ~500-token cap (rolling
// sections trimmed first, core never auto-dropped). open_threads: resolve + expiry.
function appendUserProfile(userFacts) {
  let existing = '';
  try { existing = fs.readFileSync(USER_MD, 'utf8'); } catch {}
  const { sections, schema } = parseProfile(existing);
  let changed = 0;

  // Model-driven thread resolution (only open_threads — never the profile core).
  const resolves = userFacts.filter(f => f.action === 'resolve' && f.section === 'open_threads' && f.text);
  for (const r of resolves) {
    const before = sections.open_threads.length;
    sections.open_threads = sections.open_threads.filter(ln => {
      const a = norm(ln), b = norm(r.text);
      return !(a.includes(b) || b.includes(a));
    });
    if (sections.open_threads.length < before) { changed++; log(`thread resolved: ${r.text.slice(0, 80)}`); }
  }

  // Age expiry for stale threads (in-flight work isn't in-flight after a month).
  const beforeExpiry = sections.open_threads.length;
  sections.open_threads = sections.open_threads.filter(ln => {
    const age = lineAgeDays(ln);
    return age === null || age <= THREAD_EXPIRY_DAYS;
  });
  if (sections.open_threads.length < beforeExpiry) {
    changed += beforeExpiry - sections.open_threads.length;
    log(`expired ${beforeExpiry - sections.open_threads.length} open_thread(s) > ${THREAD_EXPIRY_DAYS}d old`);
  }

  const flatBefore = norm(Object.values(sections).flat().join('\n'));
  const day = new Date().toISOString().slice(0, 10);
  const order = ['recent_corrections', 'stable_facts', 'preferences', 'working_patterns', 'open_threads'];
  const bySection = {};
  for (const f of userFacts) {
    if (f.action === 'resolve') continue;
    const text = String(f.text || '').trim();
    const evidence = String(f.evidence || '').trim();
    if (!text || evidence.length < 3) continue;                 // evidence-required guard
    const sec = PROFILE_SECTIONS.includes(f.section) ? f.section : 'preferences';
    (bySection[sec] = bySection[sec] || []).push(text);
  }

  let added = 0;
  for (const sec of order) {
    for (const text of (bySection[sec] || [])) {
      if (flatBefore.includes(norm(text))) continue;
      if (norm(sections[sec].join('\n')).includes(norm(text))) continue;
      const line = `- ${text}  <!-- ${day} -->`;
      if (sec === 'recent_corrections') sections[sec].unshift(line);
      else sections[sec].push(line);
      added++;
    }
  }
  if (!added && !changed && schema) return 0;

  if (sections.recent_corrections.length > ROLLING.recent_corrections)
    sections.recent_corrections = sections.recent_corrections.slice(0, ROLLING.recent_corrections);
  if (sections.open_threads.length > ROLLING.open_threads)
    sections.open_threads = sections.open_threads.slice(-ROLLING.open_threads);

  let rendered = renderProfile(sections);
  if (rendered.length > PROFILE_CHAR_CAP) {
    for (const sec of ['working_patterns', 'open_threads', 'recent_corrections']) {
      while (rendered.length > PROFILE_CHAR_CAP && sections[sec].length) {
        if (sec === 'recent_corrections') sections[sec].pop();
        else sections[sec].shift();
        rendered = renderProfile(sections);
      }
    }
    if (rendered.length > PROFILE_CHAR_CAP)
      log(`NOTE: USER.md ${rendered.length}B still > ${PROFILE_CHAR_CAP}B after trimming — prune via /whoami.`);
  }

  if (NOWRITE) { log('NOWRITE USER.md +', added, 'resolved/expired:', changed); return added + changed; }
  fs.mkdirSync(MEMDIR, { recursive: true });
  fs.writeFileSync(USER_MD, rendered);
  return added + changed;
}

// ── failure visibility ───────────────────────────────────────────────────────
// Fail-open must not mean fail-silent: at exactly 3 consecutive model failures,
// drop a warning into the daily note where it will actually be seen.
function bumpFailures() {
  let n = 0;
  try { n = parseInt(fs.readFileSync(FAILURES_FILE, 'utf8'), 10) || 0; } catch {}
  n++;
  try { fs.mkdirSync(DATADIR, { recursive: true }); fs.writeFileSync(FAILURES_FILE, String(n)); } catch {}
  if (n === 3 && !NOWRITE) {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const file = path.join(MEMDIR, `${day}.md`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, `# ${day}\n`);
      fs.appendFileSync(file, `\n- ⚠️ _[system]_ memory-curate: 3 consecutive model failures — check logs/memory-curate.log\n`);
    } catch {}
  }
  return n;
}
function resetFailures() { try { fs.writeFileSync(FAILURES_FILE, '0'); } catch {} }

// ── throttle (stamped BEFORE running so concurrent fires are suppressed) ─────
function throttled(force) {
  const intervalMin = parseInt(process.env.MEMORY_CURATE_INTERVAL_MIN ?? '30', 10);
  if (force || !intervalMin) return false;
  try {
    const last = parseInt(fs.readFileSync(STAMP_FILE, 'utf8'), 10) || 0;
    if ((Date.now() / 1000 - last) / 60 < intervalMin) return true;
  } catch {}
  try { fs.mkdirSync(DATADIR, { recursive: true }); fs.writeFileSync(STAMP_FILE, String(Math.floor(Date.now() / 1000))); } catch {}
  return false;
}

// ── offsets ──────────────────────────────────────────────────────────────────
function loadOffsets() {
  try { return JSON.parse(fs.readFileSync(OFFSETS_FILE, 'utf8')); } catch { return {}; }
}
function saveOffsets(o) {
  if (NOWRITE) return;
  try { fs.mkdirSync(DATADIR, { recursive: true }); fs.writeFileSync(OFFSETS_FILE, JSON.stringify(o, null, 2)); } catch {}
}

// Read [from, size) of a file; trim to whole lines. Returns {raw, end} where end is
// the byte offset of the last COMPLETE line consumed (a mid-write partial last line
// is excluded and re-read next run).
function readNewChunk(file, from, size) {
  const len = size - from;
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, buf, 0, len, from); } finally { fs.closeSync(fd); }
  let raw = buf.toString('utf8');
  let end = size;
  // A mid-line start (fresh tail-window anchor) yields a leading JSON fragment;
  // parseMessages skips unparseable lines, so no explicit trim — and saved offsets
  // sit on line boundaries, where trimming would LOSE a real message.
  // Drop a partial (unterminated) last line; re-read it complete next run.
  if (!raw.endsWith('\n')) {
    const lastNl = raw.lastIndexOf('\n');
    if (lastNl === -1) return { raw: '', end: from };
    end = size - Buffer.byteLength(raw.slice(lastNl + 1), 'utf8');
    raw = raw.slice(0, lastNl + 1);
  }
  return { raw, end };
}

function processChunk(label, msgs, currentProfile) {
  let batch = msgs;
  if (batch.length > MAX_MSGS) {
    log(`${label}: ${batch.length - MAX_MSGS} of ${batch.length} new messages dropped (per-run cap ${MAX_MSGS})`);
    batch = batch.slice(-MAX_MSGS);
  }
  let tail = batch.join('\n');
  if (tail.length > MAX_PROMPT_CHARS) tail = tail.slice(-MAX_PROMPT_CHARS);
  const res = reflect(tail, currentProfile);
  if (!res.ok) return { ok: false };
  const facts = res.facts;
  if (!facts.length) { log(`${label}: no durable facts`); return { ok: true, note: 0, user: 0 }; }
  const userFacts = facts.filter(f => f.target === 'user');
  const noteCount = appendDailyNote(facts.filter(f => !(f.action === 'resolve')));
  const userCount = appendUserProfile(userFacts);
  log(`${label}: persisted dailyNote+${noteCount}, USER.md+${userCount} (of ${facts.length} candidates)${DRY ? ' [DRYRUN]' : ''}${NOWRITE ? ' [NOWRITE]' : ''}`);
  return { ok: true, note: noteCount, user: userCount };
}

function scan(force) {
  if (throttled(force)) { log('throttled — skip (use --force to override)'); return; }
  let entries;
  try {
    entries = fs.readdirSync(PROJECTS_DIR)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .map(f => path.join(PROJECTS_DIR, f));
  } catch (e) { log('cannot read projects dir:', e.message); return; }

  const offsets = loadOffsets();
  for (const k of Object.keys(offsets)) if (!fs.existsSync(k)) delete offsets[k];

  const stats = entries
    .map(f => { try { return { f, st: fs.statSync(f) }; } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

  let currentProfile = '';
  try { currentProfile = fs.readFileSync(USER_MD, 'utf8'); } catch {}

  let processed = 0, hadFailure = false, hadSuccess = false;
  for (const { f, st } of stats) {
    if (processed >= MAX_FILES_PER_RUN) { log(`file cap ${MAX_FILES_PER_RUN} reached — remaining files next run`); break; }
    const size = st.size;
    let rec = offsets[f];
    if (!rec) {
      const ageDays = (Date.now() - st.mtimeMs) / 86400000;
      if (ageDays > SKIP_UNSEEN_OLDER_DAYS) {
        offsets[f] = { bytes: size, lastRun: new Date().toISOString() };
        continue;  // pre-cron history; consider it curated
      }
      rec = { bytes: Math.max(0, size - BACKLOG_WINDOW) };
      if (rec.bytes > 0) log(`${path.basename(f)}: first seen, starting ${BACKLOG_WINDOW}B from EOF`);
    }
    if (size < rec.bytes) { log(`${path.basename(f)}: shrank (rotation?) — resetting offset`); rec.bytes = 0; }
    offsets[f] = rec;  // pin the anchor now — never re-window on later runs
    if (size === rec.bytes) continue;

    const { raw, end } = readNewChunk(f, rec.bytes, size);
    if (!raw) continue;
    const msgs = parseMessages(raw);
    if (msgs.length < MIN_MSGS) continue;  // not enough signal yet; don't advance — accumulate

    processed++;
    const r = processChunk(path.basename(f, '.jsonl').slice(0, 8), msgs, currentProfile);
    if (r.ok) {
      offsets[f] = { bytes: end, lastRun: new Date().toISOString() };
      hadSuccess = true;
      try { currentProfile = fs.readFileSync(USER_MD, 'utf8'); } catch {}  // refresh for next file
    } else {
      hadFailure = true;  // offset NOT advanced — window retries next run
    }
  }

  if (hadFailure) log(`consecutive failures: ${bumpFailures()}`);
  else if (hadSuccess) resetFailures();
  saveOffsets(offsets);
  if (!processed) log('nothing new to curate');
}

(async () => {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--scan')) {
      scan(args.includes('--force'));
    } else {
      const tp = args.find(a => !a.startsWith('--'));
      if (!tp) { log('usage: memory-curate.cjs --scan [--force] | <transcript_path>'); process.exit(0); }
      const tail = readTranscriptTail(tp);
      if (!tail) { log('empty transcript tail — skipping'); process.exit(0); }
      let currentProfile = '';
      try { currentProfile = fs.readFileSync(USER_MD, 'utf8'); } catch {}
      processChunk(path.basename(tp).slice(0, 8), tail.split('\n'), currentProfile);
    }
  } catch (e) {
    log('fatal (ignored):', e.message);
  }
  process.exit(0);
})();
