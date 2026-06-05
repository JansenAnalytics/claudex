#!/usr/bin/env node
/*
 * memory-curate.cjs — reflect over a session transcript and persist ONLY durable facts.
 * Called by the Stop hook (memory-curate.sh). Append-only, deduped, size-aware.
 *
 *   node memory-curate.cjs <transcript_path>
 *
 * Model backend: shells out to the `claude` CLI (-p) on the Max OAuth subscription,
 * with ANTHROPIC_API_KEY stripped, so there is ZERO metered API cost. (No api.anthropic.com.)
 *
 * Env:
 *   MEMORY_CURATE_DRYRUN=1     -> skip the model call; use a stub fact set (for tests)
 *   MEMORY_CURATE_NOWRITE=1    -> compute + print, but DON'T write any files
 *   MEMORY_CURATE_TARGETDIR=…  -> override the memory dir (tests point this at a temp dir)
 *   CLAUDEX_WORKSPACE=…        -> workspace root (default ~/.claude-agent)
 *
 * Safety: never overwrites; appends under a clearly-marked section; never touches CLAUDE.md.
 * Always exits 0 (fail-open) so it can never wedge the agent from a Stop hook.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const WS = process.env.CLAUDEX_WORKSPACE || path.join(os.homedir(), '.claude-agent');
const MEMDIR = process.env.MEMORY_CURATE_TARGETDIR || path.join(WS, 'memory');
const DRY = process.env.MEMORY_CURATE_DRYRUN === '1';
const NOWRITE = process.env.MEMORY_CURATE_NOWRITE === '1';
const MODEL = process.env.MEMORY_CURATE_MODEL || 'claude-haiku-4-5';
const USER_MD = path.join(MEMDIR, 'USER.md');
const MAX_FACTS = 6;

// ── USER.md structured schema (Tier 2 item 4A) ──────────────────────────────
// Fixed sections, fixed order. The profile is rewritten (not blindly appended) so
// facts land in predictable buckets and the file stays bounded. Append-only in spirit:
// existing stable_facts/preferences are NEVER removed by the distiller — only the
// rolling sections (recent_corrections, open_threads) are trimmed to newest-N, and a
// contradiction is recorded as a NEW recent_corrections entry, never an overwrite.
const PROFILE_SECTIONS = ['stable_facts', 'preferences', 'working_patterns', 'recent_corrections', 'open_threads'];
const ROLLING = { recent_corrections: 8, open_threads: 6 }; // keep newest N in these
const PROFILE_CHAR_CAP = 2000; // ~500 tokens (chars/4) — the Hermes budget, enforced
const PROFILE_HEADER =
  '# User Profile (auto-curated — review periodically)\n' +
  '<!-- Schema: stable_facts | preferences | working_patterns | recent_corrections | open_threads.\n' +
  '     Hard cap ~500 tokens. Auto-maintained by memory-curate.cjs; review/prune via /whoami. -->\n';

const log = (...a) => console.log('[memory-curate]', ...a);

// Parse USER.md into {sections, schema}. If the file is legacy freeform (## Facts),
// migrate its bullets into `preferences` so the next write upgrades it in place.
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
  const lines = text.split('\n');
  let cur = null;
  for (const ln of lines) {
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

function readTranscriptTail(p, maxMsgs = 40) {
  let lines;
  try { lines = fs.readFileSync(p, 'utf8').trim().split('\n'); } catch { return ''; }
  const msgs = [];
  for (const ln of lines) {
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
  return msgs.slice(-maxMsgs).join('\n');
}

async function reflect(tail, currentProfile) {
  if (DRY) {
    return [
      { target: 'user', section: 'preferences', text: 'Prefers action over asking permission', evidence: 'dryrun stub' },
      { target: 'user', section: 'stable_facts', text: 'Timezone is Europe/Oslo (CET/CEST)', evidence: 'dryrun stub' },
      { target: 'user', section: 'recent_corrections', text: 'Correction: use feature branches, do NOT push to main', evidence: 'dryrun stub correction', contradicts: 'push to main' },
      { target: 'user', section: 'preferences', text: '', evidence: 'no-evidence stub (should be dropped)' }, // evidence-guard test? has evidence; text empty → dropped
      { target: 'project', text: 'Stub project milestone for dryrun', evidence: 'dryrun stub' },
    ];
  }
  const profileBlock = (currentProfile && currentProfile.trim())
    ? `\n\nCURRENT USER PROFILE (do NOT repeat facts already present; if a new fact CONTRADICTS or UPDATES one of these, set its section to "recent_corrections"):\n${currentProfile.trim().slice(0, 1500)}`
    : '';
  const prompt =
`Review this session transcript tail and extract ONLY durable facts worth persisting across FUTURE sessions:
- stated user preferences, environment/tooling facts, explicit corrections, project conventions, or completed-work milestones.
SKIP anything trivial, ephemeral, or easily re-discoverable. Be conservative: prefer fewer, higher-quality facts.

Return ONLY a JSON array (max ${MAX_FACTS}) of objects:
  {"target":"user"|"project"|"entity", "text":"concise fact", "evidence":"short why/quote", "section":"<see below>"}
For target=="user" you MUST include "section", one of:
  - stable_facts        : identity, timezone, environment, tooling — rarely change
  - preferences         : how the user likes work done
  - working_patterns    : recurring workflows, cadences, routines
  - recent_corrections  : an explicit correction, OR a fact that contradicts/updates the CURRENT USER PROFILE below
  - open_threads        : in-flight work to resume later
Every "user" fact MUST have non-empty "evidence" (a quote or clear reason) — facts without evidence will be discarded.
For non-user targets, "section" is ignored. If nothing durable, return [].${profileBlock}

TRANSCRIPT TAIL:
${tail}`;
  // Reflect via the `claude` CLI on the Max OAuth subscription — NOT a metered API key.
  // This keeps the "flat Max subscription, zero API cost" premise true for any cloner.
  //   - Strip ANTHROPIC_API_KEY so the CLI falls back to the OAuth credentials.
  //   - Run from a neutral cwd (tmpdir) so the workspace Stop hook isn't re-loaded → no recursion
  //     (memory-curate is wired only in workspace settings, not user settings).
  //   - Do NOT pass --bare: minimal mode skips OAuth loading → "Not logged in". (Verified 2026-06-05.)
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const r = spawnSync('claude', ['-p', '--model', MODEL], {
      input: prompt,
      cwd: os.tmpdir(),
      env,
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (r.error) { log('claude -p spawn failed:', r.error.message); return []; }
    if (r.status !== 0) { log('claude -p exit', r.status, (r.stderr || '').trim().slice(0, 200)); return []; }
    const txt = r.stdout || '';
    const m = txt.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.slice(0, MAX_FACTS) : [];
  } catch (e) { log('reflect failed:', e.message); return []; }
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function alreadyHas(file, text) {
  try { return norm(fs.readFileSync(file, 'utf8')).includes(norm(text)); } catch { return false; }
}

function appendDailyNote(facts) {
  const day = new Date().toISOString().slice(0, 10);
  const hm = new Date().toISOString().slice(11, 16);
  const file = path.join(MEMDIR, `${day}.md`);
  const fresh = facts.filter(f => !alreadyHas(file, f.text));
  if (!fresh.length) return 0;
  let block = `\n## 🧠 Auto-curated (session end ${hm} UTC)\n`;
  for (const f of fresh) block += `- _[${f.target}]_ ${f.text}${f.evidence ? `  — ${f.evidence}` : ''}\n`;
  if (NOWRITE) { log('NOWRITE daily-note +', fresh.length); return fresh.length; }
  fs.mkdirSync(MEMDIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, `# ${day}\n`);
  fs.appendFileSync(file, block);
  return fresh.length;
}

// Route each user fact into its schema section, with poisoning guards:
//   - evidence-required: facts with empty text or empty evidence are dropped
//   - provenance: every line is date-tagged
//   - contradiction-safe: corrections are NEW recent_corrections entries (newest-first),
//     never an overwrite of an existing stable_fact/preference
//   - hard ~500-token cap: rolling sections trimmed to newest-N, then oldest rolling
//     items dropped until under cap; the core (stable_facts/preferences) is never
//     auto-dropped — if still over, we warn and defer to /whoami review.
function appendUserProfile(userFacts) {
  if (!userFacts.length) return 0;
  let existing = '';
  try { existing = fs.readFileSync(USER_MD, 'utf8'); } catch {}
  const { sections } = parseProfile(existing);
  const flatBefore = norm(Object.values(sections).flat().join('\n'));
  const day = new Date().toISOString().slice(0, 10);

  // Bucket valid facts by section. Corrections processed first (highest value).
  const order = ['recent_corrections', 'stable_facts', 'preferences', 'working_patterns', 'open_threads'];
  const bySection = {};
  for (const f of userFacts) {
    const text = String(f.text || '').trim();
    const evidence = String(f.evidence || '').trim();
    if (!text || evidence.length < 3) continue;                 // evidence-required guard
    const sec = PROFILE_SECTIONS.includes(f.section) ? f.section : 'preferences';
    (bySection[sec] = bySection[sec] || []).push(text);
  }

  let added = 0;
  for (const sec of order) {
    for (const text of (bySection[sec] || [])) {
      if (flatBefore.includes(norm(text))) continue;            // dedupe vs existing
      if (norm(sections[sec].join('\n')).includes(norm(text))) continue; // dedupe vs just-added
      const line = `- ${text}  <!-- ${day} -->`;
      if (sec === 'recent_corrections') sections[sec].unshift(line); // newest first
      else sections[sec].push(line);
      added++;
    }
  }
  if (!added && parseProfile(existing).schema) return 0;        // nothing new and already structured

  // Trim rolling sections to newest-N (corrections newest at front, open_threads at end).
  if (sections.recent_corrections.length > ROLLING.recent_corrections)
    sections.recent_corrections = sections.recent_corrections.slice(0, ROLLING.recent_corrections);
  if (sections.open_threads.length > ROLLING.open_threads)
    sections.open_threads = sections.open_threads.slice(-ROLLING.open_threads);

  // Enforce the hard char cap by dropping OLDEST rolling items; never the core.
  let rendered = renderProfile(sections);
  if (rendered.length > PROFILE_CHAR_CAP) {
    for (const sec of ['working_patterns', 'open_threads', 'recent_corrections']) {
      while (rendered.length > PROFILE_CHAR_CAP && sections[sec].length) {
        if (sec === 'recent_corrections') sections[sec].pop();  // oldest correction at end
        else sections[sec].shift();                              // oldest other at front
        rendered = renderProfile(sections);
      }
    }
    if (rendered.length > PROFILE_CHAR_CAP)
      log(`NOTE: USER.md ${rendered.length}B still > ${PROFILE_CHAR_CAP}B after trimming rolling sections — prune stable_facts/preferences via /whoami.`);
  }

  if (NOWRITE) { log('NOWRITE USER.md +', added); return added; }
  fs.mkdirSync(MEMDIR, { recursive: true });
  fs.writeFileSync(USER_MD, rendered);
  return added;
}

(async () => {
  try {
    const tp = process.argv[2];
    if (!tp) { log('no transcript path'); process.exit(0); }
    const tail = readTranscriptTail(tp);
    if (!tail) { log('empty transcript tail — skipping'); process.exit(0); }
    let currentProfile = '';
    try { currentProfile = fs.readFileSync(USER_MD, 'utf8'); } catch {}
    const facts = await reflect(tail, currentProfile);
    if (!facts.length) { log('no durable facts'); process.exit(0); }
    const userFacts = facts.filter(f => f.target === 'user');
    const noteCount = appendDailyNote(facts);          // ALL facts digested to the daily note
    const userCount = appendUserProfile(userFacts);    // user-prefs also to the loaded-each-session USER.md
    log(`persisted: dailyNote+${noteCount}, USER.md+${userCount} (of ${facts.length} candidate facts)${DRY ? ' [DRYRUN]' : ''}${NOWRITE ? ' [NOWRITE]' : ''}`);
  } catch (e) {
    log('fatal (ignored):', e.message);
  }
  process.exit(0);
})();
