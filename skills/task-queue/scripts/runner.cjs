#!/usr/bin/env node
"use strict";

/**
 * Task Queue Runner
 * Runs every minute via cron. Finds due tasks and executes them.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const QUEUE_FILE = path.join(__dirname, "queue.json");

// ── helpers ───────────────────────────────────────────────────────────────────

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

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function now() {
  return new Date().toISOString();
}

/**
 * Parse a cron expression and check if it matches the given date.
 * Supports: minute hour dom month dow (5-field standard cron).
 * Supports * and star/N patterns only (no ranges or lists for simplicity).
 */
function cronMatches(expr, date) {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const [minF, hourF, domF, monF, dowF] = fields;

  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1; // 1-based
  const dow = date.getDay(); // 0=Sun

  function matchField(field, value, min, max) {
    if (field === "*") return true;
    // */N  — step
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2), 10);
      return value % step === 0;
    }
    // Comma-separated list
    if (field.includes(",")) {
      return field.split(",").some((f) => matchField(f.trim(), value, min, max));
    }
    // Range: N-M
    if (field.includes("-")) {
      const [lo, hi] = field.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    // Plain number
    return parseInt(field, 10) === value;
  }

  return (
    matchField(minF, minute, 0, 59) &&
    matchField(hourF, hour, 0, 23) &&
    matchField(domF, dom, 1, 31) &&
    matchField(monF, month, 1, 12) &&
    matchField(dowF, dow, 0, 6)
  );
}

/**
 * Determine if a task is due to run right now.
 */
function isDue(task, now) {
  if (task.status !== "pending") return false;

  if (task.type === "recurring" && task.cron_expr) {
    return cronMatches(task.cron_expr, now);
  }

  if (task.type === "one-shot") {
    if (!task.scheduled_at) return true; // no schedule = run immediately
    return new Date(task.scheduled_at) <= now;
  }

  return false;
}

// ── runner ────────────────────────────────────────────────────────────────────

function runTask(task) {
  log(`Running [${task.id}] "${task.name}": ${task.command}`);
  task.status = "running";
  task.started_at = now();
  task.output = null;
  task.error = null;

  try {
    const output = execSync(task.command, {
      shell: "/bin/bash",
      timeout: 5 * 60 * 1000, // 5 min max
      env: {
        ...process.env,
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$HOME/.local/bin",
      },
    });
    task.output = output.toString().trim();
    task.status = task.type === "recurring" ? "pending" : "done";
    task.finished_at = now();
    task.last_run_at = now();
    log(`  ✓ done [${task.id}] (status=${task.status})`);
    if (task.output) log(`  output: ${task.output.slice(0, 200)}`);
  } catch (err) {
    task.error = (err.stderr ? err.stderr.toString() : "") || err.message;
    task.output = err.stdout ? err.stdout.toString().trim() : null;
    // Recurring tasks go back to pending even on failure so they retry next time
    task.status = task.type === "recurring" ? "pending" : "failed";
    task.finished_at = now();
    task.last_run_at = now();
    log(`  ✗ failed [${task.id}]: ${task.error.slice(0, 200)}`);
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

(function main() {
  const nowDate = new Date();
  log(`Runner tick. Loading queue…`);
  const tasks = loadQueue();
  log(`  ${tasks.length} task(s) in queue.`);

  let ran = 0;
  for (const task of tasks) {
    if (isDue(task, nowDate)) {
      runTask(task);
      ran++;
    }
  }

  saveQueue(tasks);
  log(`  ${ran} task(s) executed.`);
})();
