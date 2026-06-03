#!/usr/bin/env node
"use strict";

/**
 * scheduler.cjs — Kite's natural language task scheduler
 * Manages a registry (~/.openclaw/schedule.json) and syncs with crontab.
 * No external dependencies — built-ins only.
 *
 * Usage:
 *   node scheduler.cjs add --name "Morning brief" --every "9am Monday-Friday" --command "..." --why "..."
 *   node scheduler.cjs add --name "Deploy check" --at "2026-02-21 18:00" --command "..." --why "..."
 *   node scheduler.cjs list
 *   node scheduler.cjs status
 *   node scheduler.cjs remove <id>
 *   node scheduler.cjs sync
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const os = require("os");

// ─── Paths ───────────────────────────────────────────────────────────────────
const REGISTRY_PATH = path.join(os.homedir(), ".openclaw", "schedule.json");
const CRON_MARKER = "# [scheduler]";

// ─── Registry helpers ─────────────────────────────────────────────────────────

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { tasks: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch (e) {
    die(`Failed to parse registry: ${e.message}`);
  }
}

function saveRegistry(registry) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n");
}

function taskById(registry, id) {
  return registry.tasks.find((t) => t.id === id);
}

// ─── Crontab helpers ──────────────────────────────────────────────────────────

function readCrontab() {
  try {
    return execSync("crontab -l 2>/dev/null", { encoding: "utf8" });
  } catch (_) {
    return "";
  }
}

function writeCrontab(content) {
  const tmp = path.join(os.tmpdir(), `scheduler-cron-${Date.now()}.txt`);
  fs.writeFileSync(tmp, content);
  const res = spawnSync("crontab", [tmp], { encoding: "utf8" });
  fs.unlinkSync(tmp);
  if (res.status !== 0) {
    die(`crontab write failed: ${res.stderr}`);
  }
}

/** Lines that are scheduler-managed (tagged). */
function schedulerLines(crontab) {
  const lines = crontab.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(CRON_MARKER)) {
      // next line is the actual cron entry
      if (i + 1 < lines.length) {
        result.push({ tag: lines[i], entry: lines[i + 1], index: i });
        i++; // skip the entry line
      }
    }
  }
  return result;
}

/** Extract id from a tag comment like "# [scheduler] id=web-monitor name=..." */
function parseTagId(tag) {
  const m = tag.match(/id=([^\s]+)/);
  return m ? m[1] : null;
}

/** Build a tag comment for a task. */
function buildTag(task) {
  return `${CRON_MARKER} id=${task.id} name=${JSON.stringify(task.name)}`;
}

/** Build the cron line for a task. */
function buildCronLine(task) {
  return `${task.cron} ${task.command}`;
}

/** Remove a scheduler-managed block from crontab text by id. */
function removeCronById(crontab, id) {
  const lines = crontab.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith(CRON_MARKER) && parseTagId(lines[i]) === id) {
      i += 2; // skip tag + entry
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join("\n");
}

/** Add a scheduler block to crontab text. */
function addCronBlock(crontab, task) {
  const block = `${buildTag(task)}\n${buildCronLine(task)}`;
  const trimmed = crontab.trimEnd();
  return trimmed ? trimmed + "\n" + block + "\n" : block + "\n";
}

// ─── Natural language time parser ─────────────────────────────────────────────

/**
 * parseCron(expr) → { cron: string, oneShot: boolean, isoDateTime?: string }
 *
 * Understands:
 *   Interval:  "every 15 minutes", "every 2 hours", "every hour", "every day"
 *   Daily:     "every day at 9am", "daily at 9:30am"
 *   Weekly:    "every Monday at 8:30am", "every weekday at 9am", "every weekend at noon"
 *   Multi:     "twice a day", "3 times a day"
 *   Midnight:  "every Sunday at midnight", "every day at midnight"
 *   Noon:      "every day at noon"
 *   One-shot:  handled by --at flag (ISO datetime)
 */
function parseCron(expr) {
  if (!expr) return null;
  const s = expr.toLowerCase().trim();

  // ── helpers ──
  const dayMap = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  function parseTime(timeStr) {
    // returns { h, m } or null
    if (!timeStr) return null;
    timeStr = timeStr.trim().toLowerCase();
    if (timeStr === "midnight") return { h: 0, m: 0 };
    if (timeStr === "noon") return { h: 12, m: 0 };

    const m12 = timeStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (m12) {
      let h = parseInt(m12[1], 10);
      const min = m12[2] ? parseInt(m12[2], 10) : 0;
      const ampm = m12[3];
      if (ampm === "pm" && h !== 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      return { h, m: min };
    }
    const m24 = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (m24) {
      return { h: parseInt(m24[1], 10), m: parseInt(m24[2], 10) };
    }
    return null;
  }

  // ── interval: "every N minutes/hours/days" ──
  {
    const m = s.match(/^every\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = m[2];
      if (unit.startsWith("min")) return { cron: `*/${n} * * * *` };
      if (unit.startsWith("h")) return { cron: `0 */${n} * * *` };
      if (unit.startsWith("d")) return { cron: `0 0 */${n} * *` };
    }
  }

  // ── "every minute" ──
  if (s === "every minute") return { cron: "* * * * *" };

  // ── "every hour" ──
  if (s === "every hour" || s === "hourly") return { cron: "0 * * * *" };

  // ── "every day" / "daily" (no time → midnight) ──
  if (s === "every day" || s === "daily") return { cron: "0 0 * * *" };

  // ── "every day at <time>" / "daily at <time>" ──
  {
    const m = s.match(/^(?:every\s+day|daily)\s+at\s+(.+)$/);
    if (m) {
      const t = parseTime(m[1]);
      if (t) return { cron: `${t.m} ${t.h} * * *` };
    }
  }

  // ── "every morning" → 9am, "every evening" → 6pm, "every night" → 10pm ──
  const namedTimes = {
    morning: { h: 9, m: 0 },
    evening: { h: 18, m: 0 },
    night: { h: 22, m: 0 },
    noon: { h: 12, m: 0 },
    midnight: { h: 0, m: 0 },
  };
  for (const [word, t] of Object.entries(namedTimes)) {
    if (s === `every ${word}`) return { cron: `${t.m} ${t.h} * * *` };
  }

  // ── "every weekday at <time>" ──
  {
    const m = s.match(/^every\s+weekday(?:\s+at\s+(.+))?$/);
    if (m) {
      const t = m[1] ? parseTime(m[1]) : { h: 9, m: 0 };
      if (t) return { cron: `${t.m} ${t.h} * * 1-5` };
    }
  }

  // ── "every weekend at <time>" ──
  {
    const m = s.match(/^every\s+weekend(?:\s+at\s+(.+))?$/);
    if (m) {
      const t = m[1] ? parseTime(m[1]) : { h: 10, m: 0 };
      if (t) return { cron: `${t.m} ${t.h} * * 6,0` };
    }
  }

  // ── "every <day> at <time>" / "every <day>" ──
  {
    // "every Monday-Friday at 9am"
    const mRange = s.match(/^every\s+(\w+)-(\w+)(?:\s+at\s+(.+))?$/);
    if (mRange) {
      const d1 = dayMap[mRange[1]];
      const d2 = dayMap[mRange[2]];
      if (d1 !== undefined && d2 !== undefined) {
        const t = mRange[3] ? parseTime(mRange[3]) : { h: 9, m: 0 };
        if (t) return { cron: `${t.m} ${t.h} * * ${d1}-${d2}` };
      }
    }

    // "every Monday at 9am"
    const mSingle = s.match(/^every\s+(\w+)(?:\s+at\s+(.+))?$/);
    if (mSingle && dayMap[mSingle[1]] !== undefined) {
      const d = dayMap[mSingle[1]];
      const t = mSingle[2] ? parseTime(mSingle[2]) : { h: 9, m: 0 };
      if (t) return { cron: `${t.m} ${t.h} * * ${d}` };
    }
  }

  // ── "twice a day" → 9am and 9pm ──
  if (s === "twice a day" || s === "twice daily") return { cron: "0 9,21 * * *" };

  // ── "N times a day" ──
  {
    const m = s.match(/^(\d+)\s+times?\s+(?:a|per)\s+day$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n === 1) return { cron: "0 9 * * *" };
      if (n === 2) return { cron: "0 9,21 * * *" };
      if (n === 3) return { cron: "0 7,13,19 * * *" };
      if (n === 4) return { cron: "0 6,12,18,0 * * *" };
      // Generic: spread evenly
      const interval = Math.floor(24 / n);
      const hours = Array.from({ length: n }, (_, i) => (i * interval) % 24).join(",");
      return { cron: `0 ${hours} * * *` };
    }
  }

  // ── "every N weeks" ──
  {
    const m = s.match(/^every\s+(\d+)\s+weeks?$/);
    if (m) {
      return { cron: `0 9 * * ${parseInt(m[1], 10) % 7}` };
    }
  }

  // ── "every <time>" (just a time, daily) ──
  {
    const m = s.match(/^every\s+(.+)$/);
    if (m) {
      const t = parseTime(m[1]);
      if (t) return { cron: `${t.m} ${t.h} * * *` };
    }
  }

  // ── Raw cron expression passthrough (5 fields) ──
  if (/^[\d*,\-\/]+ [\d*,\-\/]+ [\d*,\-\/]+ [\d*,\-\/]+ [\d*,\-\/]+$/.test(s)) {
    return { cron: s };
  }

  return null;
}

/**
 * parseOneShot(expr) → Date or null
 * Understands: "2026-02-21 18:00", "tomorrow at 3pm", "in 2 hours", etc.
 */
function parseOneShot(expr) {
  const s = expr.trim();
  // ISO datetime
  const iso = new Date(s);
  if (!isNaN(iso.getTime())) return iso;

  const now = new Date();

  // "in N minutes/hours"
  const mIn = s.match(/^in\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/i);
  if (mIn) {
    const n = parseInt(mIn[1], 10);
    const unit = mIn[2].toLowerCase();
    const ms = unit.startsWith("m") ? n * 60000 : unit.startsWith("h") ? n * 3600000 : n * 86400000;
    return new Date(now.getTime() + ms);
  }

  // "tomorrow at <time>"
  const mTomorrow = s.match(/^tomorrow\s+at\s+(.+)$/i);
  if (mTomorrow) {
    const t = parseTimeStr(mTomorrow[1]);
    if (t) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(t.h, t.m, 0, 0);
      return d;
    }
  }

  // "today at <time>"
  const mToday = s.match(/^today\s+at\s+(.+)$/i);
  if (mToday) {
    const t = parseTimeStr(mToday[1]);
    if (t) {
      const d = new Date(now);
      d.setHours(t.h, t.m, 0, 0);
      return d;
    }
  }

  return null;
}

function parseTimeStr(str) {
  str = str.trim().toLowerCase();
  if (str === "midnight") return { h: 0, m: 0 };
  if (str === "noon") return { h: 12, m: 0 };
  const m = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3];
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return { h, m: min };
}

// ─── ID generation ─────────────────────────────────────────────────────────────

function nameToId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(registry, base) {
  let id = base;
  let n = 2;
  while (taskById(registry, id)) {
    id = `${base}-${n++}`;
  }
  return id;
}

// ─── One-shot scheduling ───────────────────────────────────────────────────────

/**
 * Schedule a one-shot command at a given Date.
 * Strategy: write a self-deleting cron entry (runs once then removes itself).
 */
function scheduleOneShot(task, date) {
  const min = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;

  // Self-deleting: runs cron entry, then uses a wrapper script that removes itself.
  // We store the task's cron as the one-shot pattern; the "command" includes
  // a post-run step to remove the cron entry.
  const cronExpr = `${min} ${hour} ${day} ${month} *`;

  // The self-destruct wrapper: run command, then remove the scheduler cron block.
  const selfDestructCmd = [
    task.command,
    `&& /usr/bin/node ${__filename} remove ${task.id} --no-output 2>/dev/null || true`,
  ].join(" ");

  return { cronExpr, selfDestructCmd };
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdAdd(args) {
  const opts = parseArgs(args);
  const name = opts["name"];
  const every = opts["every"];
  const at = opts["at"];
  const command = opts["command"];
  const why = opts["why"] || "";

  if (!name) die("--name is required");
  if (!command) die("--command is required");
  if (!every && !at) die("--every or --at is required");

  const registry = loadRegistry();
  const id = uniqueId(registry, nameToId(name));
  const today = new Date().toISOString().slice(0, 10);

  let cronExpr,
    finalCommand,
    oneShot = false;

  if (every) {
    const parsed = parseCron(every);
    if (!parsed)
      die(
        `Could not parse time expression: "${every}"\nRun 'node scheduler.cjs help-times' for supported formats.`,
      );
    cronExpr = parsed.cron;
    finalCommand = command;
  } else {
    // one-shot via --at
    const date = parseOneShot(at);
    if (!date)
      die(
        `Could not parse datetime: "${at}"\nExpected formats: "2026-02-21 18:00", "tomorrow at 3pm", "in 2 hours"`,
      );
    if (date < new Date()) die(`The time "${at}" is in the past.`);
    const { cronExpr: ce, selfDestructCmd } = scheduleOneShot({ id, command }, date);
    cronExpr = ce;
    finalCommand = selfDestructCmd;
    oneShot = true;
    console.log(`⏰ One-shot scheduled for ${date.toLocaleString()}`);
  }

  const task = {
    id,
    name,
    cron: cronExpr,
    command: finalCommand,
    why,
    created_at: today,
    status: "active",
    ...(oneShot ? { one_shot: true, scheduled_at: at } : {}),
  };

  registry.tasks.push(task);
  saveRegistry(registry);

  // Add to crontab
  const crontab = readCrontab();
  const updated = addCronBlock(crontab, task);
  writeCrontab(updated);

  console.log(`✅ Added task "${name}" (id: ${id})`);
  console.log(`   Cron:    ${cronExpr}`);
  console.log(`   Command: ${finalCommand}`);
  if (why) console.log(`   Why:     ${why}`);
}

function cmdList(args) {
  const registry = loadRegistry();
  const tasks = registry.tasks.filter((t) => t.status !== "removed");

  if (tasks.length === 0) {
    console.log("No scheduled tasks.");
    return;
  }

  console.log("\n📅 Scheduled Tasks\n" + "─".repeat(60));
  for (const t of tasks) {
    const oneShot = t.one_shot ? " [one-shot]" : "";
    const status = t.status === "active" ? "🟢" : "🔴";
    console.log(`\n${status} ${t.name} (${t.id})${oneShot}`);
    console.log(`   Cron:    ${t.cron}`);
    console.log(`   Command: ${t.command}`);
    if (t.why) console.log(`   Why:     ${t.why}`);
    console.log(`   Created: ${t.created_at}`);
  }
  console.log("");
}

function cmdStatus(args) {
  const registry = loadRegistry();
  const crontab = readCrontab();
  const managed = schedulerLines(crontab);
  const tasks = registry.tasks.filter((t) => t.status !== "removed");

  console.log("\n🔍 Scheduler Status\n" + "─".repeat(60));

  // What's in registry vs crontab
  const registryIds = new Set(tasks.map((t) => t.id));
  const crontabIds = new Set(managed.map((m) => parseTagId(m.tag)).filter(Boolean));

  // In registry, check if in crontab
  for (const t of tasks) {
    const inCron = crontabIds.has(t.id);
    const icon = inCron ? "✅" : "⚠️ ";
    console.log(`${icon} ${t.name} (${t.id})`);
    if (!inCron) console.log(`     → In registry but MISSING from crontab! Run 'sync' to fix.`);
  }

  // In crontab but not in registry
  for (const id of crontabIds) {
    if (!registryIds.has(id)) {
      console.log(`⚠️  ${id} → In crontab but NOT in registry (ghost entry)`);
    }
  }

  // Non-managed crontab lines
  const allCronLines = crontab.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  const managedLines = new Set(managed.map((m) => m.entry));
  const unmanaged = allCronLines.filter((l) => !managedLines.has(l));

  if (unmanaged.length > 0) {
    console.log("\n📋 Unmanaged cron entries (not in registry):");
    for (const l of unmanaged) {
      console.log(`   ${l}`);
    }
  }

  console.log("");
}

function cmdRemove(args) {
  const opts = parseArgs(args);
  const id = args[0] || opts["id"];
  const noOutput = opts["no-output"] !== undefined;

  if (!id) die("Usage: remove <id>");

  const registry = loadRegistry();
  const task = taskById(registry, id);
  if (!task) die(`Task not found: ${id}`);

  // Mark removed in registry
  task.status = "removed";
  saveRegistry(registry);

  // Remove from crontab
  const crontab = readCrontab();
  const updated = removeCronById(crontab, id);
  writeCrontab(updated);

  if (!noOutput) {
    console.log(`🗑️  Removed task "${task.name}" (${id}) from registry and crontab.`);
  }
}

function cmdSync(args) {
  const registry = loadRegistry();
  const crontab = readCrontab();

  const activeTasks = registry.tasks.filter((t) => t.status === "active");
  const managed = schedulerLines(crontab);
  const crontabIds = new Set(managed.map((m) => parseTagId(m.tag)).filter(Boolean));

  let changes = 0;
  let current = crontab;

  // Remove crontab entries for removed tasks
  const removedTasks = registry.tasks.filter((t) => t.status === "removed");
  for (const t of removedTasks) {
    if (crontabIds.has(t.id)) {
      current = removeCronById(current, t.id);
      console.log(`🗑️  Removed ghost cron entry for ${t.id}`);
      changes++;
    }
  }

  // Add missing entries for active tasks
  for (const task of activeTasks) {
    if (!crontabIds.has(task.id)) {
      current = addCronBlock(current, task);
      console.log(`➕ Added cron entry for ${task.id} (${task.name})`);
      changes++;
    }
  }

  // Update changed entries
  for (const task of activeTasks) {
    const found = managed.find((m) => parseTagId(m.tag) === task.id);
    if (found) {
      const expected = buildCronLine(task);
      if (found.entry !== expected) {
        current = removeCronById(current, task.id);
        current = addCronBlock(current, task);
        console.log(`🔄 Updated cron entry for ${task.id}`);
        changes++;
      }
    }
  }

  if (changes === 0) {
    console.log("✅ Registry and crontab are in sync. No changes needed.");
  } else {
    writeCrontab(current);
    console.log(`\n✅ Sync complete. ${changes} change(s) applied.`);
  }
}

function cmdHelpTimes() {
  console.log(`
📅 Supported Natural Language Time Formats
${"─".repeat(50)}

Intervals:
  every minute
  every 15 minutes
  every 2 hours
  every hour / hourly
  every 3 days

Daily:
  every day         → midnight
  every day at 9am
  every day at 9:30am
  every day at 14:00
  daily at noon
  daily at midnight

Named times of day:
  every morning     → 9:00 AM
  every evening     → 6:00 PM
  every night       → 10:00 PM

Weekly:
  every Monday
  every Monday at 8:30am
  every Tuesday at 2pm
  every weekend at 10am
  every weekday at 9am
  every Monday-Friday at 9am

Multi-daily:
  twice a day       → 9am and 9pm
  twice daily
  3 times a day     → 7am, 1pm, 7pm
  4 times a day

One-shots (via --at):
  2026-02-21 18:00
  tomorrow at 3pm
  today at 6pm
  in 2 hours
  in 30 minutes
  in 1 day

Raw cron (passed through):
  */15 * * * *
  0 9 * * 1-5
`);
}

function cmdHelp() {
  console.log(`
🗓️  Kite Scheduler CLI
Usage: node scheduler.cjs <command> [options]

Commands:
  add     Add a recurring or one-shot task
  list    List all tasks in the registry
  status  Compare registry vs crontab (detect drift)
  remove  Remove a task from registry and crontab
  sync    Reconcile registry → crontab
  help-times  Show all supported time formats

Add options:
  --name "..."      Task name (required)
  --every "..."     Recurring time expression (see help-times)
  --at "..."        One-shot datetime ("2026-02-21 18:00", "in 2 hours")
  --command "..."   Shell command to run (required)
  --why "..."       Human explanation of why this job exists

Examples:
  node scheduler.cjs add --name "Morning brief" --every "9am Monday-Friday" \\
    --command "node $HOME/scripts/brief.cjs" --why "Daily summary"

  node scheduler.cjs add --name "Deploy check" --at "2026-02-21 18:00" \\
    --command "node $HOME/scripts/check-deploy.cjs" --why "Verify prod"

  node scheduler.cjs list
  node scheduler.cjs status
  node scheduler.cjs remove morning-brief
  node scheduler.cjs sync
`);
}

// ─── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        opts[key] = next;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }
  return opts;
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case "add":
    cmdAdd(rest);
    break;
  case "list":
    cmdList(rest);
    break;
  case "status":
    cmdStatus(rest);
    break;
  case "remove":
    cmdRemove(rest);
    break;
  case "sync":
    cmdSync(rest);
    break;
  case "help-times":
    cmdHelpTimes();
    break;
  case "help":
  case "--help":
  case "-h":
    cmdHelp();
    break;
  default:
    console.error(`Unknown command: ${cmd || "(none)"}`);
    cmdHelp();
    process.exit(1);
}
