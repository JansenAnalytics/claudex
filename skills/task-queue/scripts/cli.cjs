#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const QUEUE_FILE = path.join(__dirname, "queue.json");

// ── helpers ──────────────────────────────────────────────────────────────────

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveQueue(tasks) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(tasks, null, 2) + "\n");
}

function newId() {
  return crypto.randomBytes(4).toString("hex");
}

function now() {
  return new Date().toISOString();
}

function statusIcon(s) {
  return { pending: "⏳", running: "▶️", done: "✅", failed: "❌", cancelled: "🚫" }[s] || "❓";
}

function parseArgs(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      flags[key] = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else {
      args.push(argv[i]);
    }
  }
  return { args, flags };
}

// ── commands ──────────────────────────────────────────────────────────────────

function cmdAdd(argv) {
  const { args, flags } = parseArgs(argv);
  if (args.length < 2) {
    console.error('Usage: cli.cjs add "name" "command" [--at "ISO"] [--every "cron"]');
    process.exit(1);
  }
  const [name, command] = args;

  if (flags.at && flags.every) {
    console.error("Error: use --at OR --every, not both.");
    process.exit(1);
  }

  const task = {
    id: newId(),
    name,
    command,
    status: "pending",
    type: flags.every ? "recurring" : "one-shot",
    scheduled_at: flags.at || null,
    cron_expr: flags.every || null,
    created_at: now(),
    started_at: null,
    finished_at: null,
    last_run_at: null,
    output: null,
    error: null,
  };

  const tasks = loadQueue();
  tasks.push(task);
  saveQueue(tasks);
  console.log(`Added task [${task.id}] "${name}" (${task.type})`);
  if (task.scheduled_at) console.log(`  Scheduled at: ${task.scheduled_at}`);
  if (task.cron_expr) console.log(`  Cron: ${task.cron_expr}`);
}

function cmdList(argv) {
  const { flags } = parseArgs(argv);
  let tasks = loadQueue();
  if (flags.status) tasks = tasks.filter((t) => t.status === flags.status);

  if (tasks.length === 0) {
    console.log("No tasks found.");
    return;
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad("ID", 10) + pad("STATUS", 12) + pad("TYPE", 11) + pad("SCHEDULED", 26) + "NAME");
  console.log("─".repeat(80));
  for (const t of tasks) {
    const sched = t.cron_expr || t.scheduled_at || "(immediate)";
    console.log(
      pad(t.id, 10) +
        statusIcon(t.status) +
        " " +
        pad(t.status, 10) +
        pad(t.type, 11) +
        pad(sched, 26) +
        t.name,
    );
  }
}

function cmdStatus(argv) {
  const { args } = parseArgs(argv);
  if (!args[0]) {
    console.error("Usage: cli.cjs status <id>");
    process.exit(1);
  }
  const tasks = loadQueue();
  const task = tasks.find((t) => t.id === args[0]);
  if (!task) {
    console.error(`Task ${args[0]} not found.`);
    process.exit(1);
  }

  for (const [k, v] of Object.entries(task)) {
    if (v !== null && v !== undefined) {
      console.log(
        `${String(k).padEnd(16)}: ${typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v}`,
      );
    }
  }
  if (task.output) {
    console.log("\n── output ──");
    console.log(task.output.slice(0, 2000));
  }
  if (task.error) {
    console.log("\n── error ──");
    console.log(task.error.slice(0, 2000));
  }
}

function cmdCancel(argv) {
  const { args } = parseArgs(argv);
  if (!args[0]) {
    console.error("Usage: cli.cjs cancel <id>");
    process.exit(1);
  }
  const tasks = loadQueue();
  const task = tasks.find((t) => t.id === args[0]);
  if (!task) {
    console.error(`Task ${args[0]} not found.`);
    process.exit(1);
  }
  task.status = "cancelled";
  task.finished_at = now();
  saveQueue(tasks);
  console.log(`Task [${args[0]}] cancelled.`);
}

function cmdClear(argv) {
  const { flags } = parseArgs(argv);
  let tasks = loadQueue();
  const before = tasks.length;
  if (flags.done) {
    tasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
  } else if (flags.failed) {
    tasks = tasks.filter((t) => t.status !== "failed");
  } else if (flags.all) {
    tasks = [];
  } else {
    console.error("Usage: cli.cjs clear --done | --failed | --all");
    process.exit(1);
  }
  saveQueue(tasks);
  console.log(`Removed ${before - tasks.length} task(s). ${tasks.length} remaining.`);
}

function cmdDone(argv) {
  const { args } = parseArgs(argv);
  if (!args[0]) {
    console.error("Usage: cli.cjs done <id>");
    process.exit(1);
  }
  const tasks = loadQueue();
  const task = tasks.find((t) => t.id === args[0]);
  if (!task) {
    console.error(`Task ${args[0]} not found.`);
    process.exit(1);
  }
  task.status = "done";
  task.finished_at = now();
  saveQueue(tasks);
  console.log(`Task [${args[0]}] marked done.`);
}

// ── main ─────────────────────────────────────────────────────────────────────

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
  case "cancel":
    cmdCancel(rest);
    break;
  case "clear":
    cmdClear(rest);
    break;
  case "done":
    cmdDone(rest);
    break;
  default:
    console.log(`Kite Task Queue CLI
Usage:
  cli.cjs add "name" "command" [--at "ISO"] [--every "cron"]
  cli.cjs list [--status pending|running|done|failed|cancelled]
  cli.cjs status <id>
  cli.cjs cancel <id>
  cli.cjs done <id>
  cli.cjs clear --done | --failed | --all`);
}
