#!/usr/bin/env node
/**
 * Cron Dashboard — Unified view of all scheduled jobs, services, and their health.
 *
 * Commands:
 *   cron-dash status              — Full dashboard (crons + services + health)
 *   cron-dash crons               — List all crontab entries with schedule info
 *   cron-dash services            — List systemd services (user + system)
 *   cron-dash logs [name]         — Show recent log output for a job
 *   cron-dash health              — Health check all jobs (log freshness, errors)
 *   cron-dash history [name]      — Show run history from logs
 *   cron-dash next [hours]        — Show upcoming cron runs in next N hours
 *   cron-dash errors [name]       — Show recent errors across all job logs
 *   cron-dash diagnose [name]     — Deep diagnosis of a failing job
 *   cron-dash add <schedule> <cmd> [--name NAME] — Add a new cron job
 *   cron-dash remove <pattern>    — Remove cron entries matching pattern
 *   cron-dash disable <pattern>   — Comment out cron entries
 *   cron-dash enable <pattern>    — Uncomment cron entries
 *   cron-dash export              — Export full dashboard as JSON
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ==================== HELPERS ====================

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: opts.timeout || 10000, ...opts }).trim();
  } catch (e) {
    return opts.fallback !== undefined ? opts.fallback : '';
  }
}

function timeAgo(date) {
  if (!date) return 'never';
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 0) return 'future';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

function colorStatus(status) {
  const colors = {
    healthy: '\x1b[32m✅ healthy\x1b[0m',
    warning: '\x1b[33m⚠️  warning\x1b[0m',
    error: '\x1b[31m❌ error\x1b[0m',
    stale: '\x1b[33m⏰ stale\x1b[0m',
    unknown: '\x1b[90m❓ unknown\x1b[0m',
    active: '\x1b[32m● active\x1b[0m',
    inactive: '\x1b[90m○ inactive\x1b[0m',
    failed: '\x1b[31m✖ failed\x1b[0m',
    disabled: '\x1b[90m◌ disabled\x1b[0m',
  };
  return colors[status] || status;
}

function padRight(str, len) {
  return (str || '').slice(0, len).padEnd(len);
}

// ==================== CRON PARSING ====================

function parseCrontab() {
  const raw = run('crontab -l 2>/dev/null', { fallback: '' });
  if (!raw) return [];

  const entries = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Comment line (possible header for next entry)
    if (line.startsWith('#')) {
      // Check if it's a disabled cron (commented out cron expression)
      const disabledMatch = line.match(/^#\s*(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
      if (disabledMatch && /^[0-9*\/,\-]+$/.test(disabledMatch[1].split(/\s+/)[0])) {
        entries.push({
          schedule: disabledMatch[1],
          command: disabledMatch[2],
          comment: '',
          disabled: true,
          line: i + 1,
          raw: line,
          ...parseCronExpression(disabledMatch[1]),
          ...extractJobInfo(disabledMatch[2]),
        });
      }
      continue;
    }

    // Empty line
    if (!line) continue;

    // Parse cron expression
    const match = line.match(/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(.+)$/);
    if (!match) continue;

    const schedule = match[1];
    const command = match[2];

    // Look for preceding comment
    let comment = '';
    if (i > 0 && lines[i - 1].trim().startsWith('#')) {
      comment = lines[i - 1].trim().replace(/^#+\s*/, '');
    }

    entries.push({
      schedule,
      command,
      comment,
      disabled: false,
      line: i + 1,
      raw: line,
      ...parseCronExpression(schedule),
      ...extractJobInfo(command),
    });
  }

  return entries;
}

function parseCronExpression(expr) {
  const parts = expr.split(/\s+/);
  if (parts.length < 5) return { human: expr };

  const [min, hour, dom, month, dow] = parts;

  // Generate human-readable description
  let human = '';

  if (min === '*' && hour === '*') {
    human = 'Every minute';
  } else if (min.startsWith('*/')) {
    const interval = parseInt(min.slice(2));
    human = `Every ${interval} min`;
  } else if (hour === '*') {
    human = `At :${min.padStart(2, '0')} every hour`;
  } else if (hour.includes(',')) {
    const hours = hour.split(',').map(h => `${h}:${min.padStart(2, '0')}`);
    human = `At ${hours.join(', ')}`;
  } else {
    human = `At ${hour}:${min.padStart(2, '0')}`;
  }

  // Day of week
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (dow !== '*') {
    const days = dow.split(',').map(d => dowNames[parseInt(d)] || d);
    human += ` on ${days.join(',')}`;
  }

  // Day of month
  if (dom !== '*') {
    human += ` on day ${dom}`;
  }

  // Month
  if (month !== '*') {
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = month.split(',').map(m => monthNames[parseInt(m)] || m);
    human += ` in ${months.join(',')}`;
  }

  // Calculate expected interval in minutes
  let intervalMinutes = null;
  if (min.startsWith('*/')) intervalMinutes = parseInt(min.slice(2));
  else if (min !== '*' && hour === '*') intervalMinutes = 60;
  else if (min !== '*' && hour !== '*' && !hour.includes(',') && dow === '*') intervalMinutes = 1440;
  else if (min !== '*' && hour !== '*' && dow !== '*') intervalMinutes = 1440 * 7; // Weekly
  else if (hour.includes(',')) intervalMinutes = 1440 / hour.split(',').length;

  return { human, intervalMinutes };
}

function extractJobInfo(command) {
  const info = { name: '', logFile: '', workDir: '' };

  // Extract log file from >> redirect
  const logMatch = command.match(/>>?\s*(\S+\.log)\b/);
  if (logMatch) {
    let logPath = logMatch[1];
    // Resolve relative paths against cd workdir
    const cdMatch2 = command.match(/cd\s+(\S+)/);
    if (cdMatch2 && !logPath.startsWith('/') && !logPath.startsWith('~')) {
      logPath = path.join(cdMatch2[1].replace(/^~/, os.homedir()), logPath);
    }
    info.logFile = logPath;
  }

  // Extract working directory from cd command
  const cdMatch = command.match(/cd\s+(\S+)/);
  if (cdMatch) info.workDir = cdMatch[1];

  // Try to derive a name
  const scriptMatch = command.match(/(?:node|python3?|bash|sh)\s+(?:\S+\/)?(\S+?)(?:\.(?:cjs|mjs|js|py|sh))?(?:\s|$)/);
  if (scriptMatch) {
    info.name = scriptMatch[1].replace(/[._-]/g, '-');
  } else {
    // Use the project directory name
    const projMatch = command.match(/\/projects\/([^/]+)/);
    if (projMatch) info.name = projMatch[1];
  }

  return info;
}

function getNextRuns(entries, hours = 24) {
  const now = new Date();
  const end = new Date(now.getTime() + hours * 3600000);
  const runs = [];

  for (const entry of entries) {
    if (entry.disabled) continue;

    const parts = entry.schedule.split(/\s+/);
    if (parts.length < 5) continue;

    const [minExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;

    // Simple next-run calculation for common patterns
    const expandField = (expr, max, min = 0) => {
      if (expr === '*') return Array.from({ length: max - min + 1 }, (_, i) => i + min);
      if (expr.startsWith('*/')) {
        const step = parseInt(expr.slice(2));
        const vals = [];
        for (let i = min; i <= max; i += step) vals.push(i);
        return vals;
      }
      return expr.split(',').map(Number);
    };

    const validMins = expandField(minExpr, 59, 0);
    const validHours = expandField(hourExpr, 23, 0);
    const validDow = dowExpr === '*' ? null : expandField(dowExpr, 6, 0);
    const validDom = domExpr === '*' ? null : expandField(domExpr, 31, 1);

    // Walk forward minute by minute (up to limit)
    let check = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1);

    let found = 0;
    const maxCheck = hours * 60;
    for (let i = 0; i < maxCheck && found < 3; i++) {
      const m = check.getMinutes();
      const h = check.getHours();
      const d = check.getDay();
      const dm = check.getDate();

      if (validMins.includes(m) && validHours.includes(h) &&
          (!validDow || validDow.includes(d)) &&
          (!validDom || validDom.includes(dm))) {
        runs.push({
          time: new Date(check),
          name: entry.name || entry.command.slice(0, 40),
          schedule: entry.human,
        });
        found++;
        // Jump past this minute
        check = new Date(check.getTime() + 60000);
        continue;
      }

      check = new Date(check.getTime() + 60000);
    }
  }

  return runs.sort((a, b) => a.time - b.time);
}

// ==================== LOG ANALYSIS ====================

function analyzeLog(logPath) {
  const resolved = logPath.replace(/^~/, os.homedir());

  if (!fs.existsSync(resolved)) {
    return { exists: false, path: resolved };
  }

  const stat = fs.statSync(resolved);
  const lastModified = stat.mtime;
  const size = stat.size;

  // Read last N lines
  const tail = run(`tail -100 "${resolved}" 2>/dev/null`, { fallback: '' });
  const lines = tail.split('\n').filter(l => l.trim());

  // Count errors
  const errorPatterns = /\b(error|fail|exception|crash|fatal|panic|ENOENT|EACCES|ECONNREFUSED|timeout|refused|denied)\b/i;
  const errorLines = lines.filter(l => errorPatterns.test(l));

  // Find last timestamp
  let lastTimestamp = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const tsMatch = lines[i].match(/(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2})/);
    if (tsMatch) {
      lastTimestamp = new Date(tsMatch[1]);
      break;
    }
  }

  // Last line content
  const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';

  return {
    exists: true,
    path: resolved,
    size,
    sizeHuman: humanSize(size),
    lastModified,
    lastModifiedAgo: timeAgo(lastModified),
    lastTimestamp,
    lastTimestampAgo: lastTimestamp ? timeAgo(lastTimestamp) : null,
    totalLines: parseInt(run(`wc -l < "${resolved}" 2>/dev/null`, { fallback: '0' })),
    recentErrors: errorLines.length,
    recentErrorSamples: errorLines.slice(-3),
    lastLine: lastLine.slice(0, 200),
  };
}

function getJobHealth(entry, logInfo) {
  if (entry.disabled) return 'disabled';
  if (!logInfo || !logInfo.exists) return 'unknown';

  const now = Date.now();
  const lastMod = logInfo.lastModified ? logInfo.lastModified.getTime() : 0;
  const ageMinutes = (now - lastMod) / 60000;

  // Check staleness based on expected interval
  if (entry.intervalMinutes) {
    const threshold = entry.intervalMinutes * 2.5; // 2.5x tolerance
    if (ageMinutes > threshold) return 'stale';
  } else if (!entry.intervalMinutes && ageMinutes > 1440 * 3) {
    // No known interval, 3 days stale
    return 'stale';
  } else if (entry.intervalMinutes && entry.intervalMinutes >= 1440 * 7) {
    // Weekly+ jobs: stale if more than interval + 1 day
    if (ageMinutes > entry.intervalMinutes + 1440) return 'stale';
  }

  // Check for recent errors
  if (logInfo.recentErrors > 5) return 'error';
  if (logInfo.recentErrors > 0) return 'warning';

  return 'healthy';
}

// ==================== SYSTEMD ====================

function getSystemdServices() {
  const services = [];

  // User services
  const userUnits = run('systemctl --user list-units --type=service --all --no-pager --no-legend 2>/dev/null', { fallback: '' });
  for (const line of userUnits.split('\n').filter(l => l.trim())) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    const name = parts[0].replace('.service', '');
    // Only include our custom services
    if (name.match(/openclaw|riften|brew|docker|colleague/i)) {
      services.push({
        name,
        scope: 'user',
        loaded: parts[1],
        active: parts[2],
        sub: parts[3],
        description: parts.slice(4).join(' '),
      });
    }
  }

  // System services (our stuff only)
  const systemUnits = run('systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null', { fallback: '' });
  for (const line of systemUnits.split('\n').filter(l => l.trim())) {
    if (!line.match(/openclaw|riften|brew|docker/i)) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    services.push({
      name: parts[0].replace('.service', ''),
      scope: 'system',
      loaded: parts[1],
      active: parts[2],
      sub: parts[3],
      description: parts.slice(4).join(' '),
    });
  }

  return services;
}

function getServiceDetails(name) {
  // Try user scope first, then system
  let status = run(`systemctl --user status ${name}.service 2>/dev/null`, { fallback: '' });
  let scope = 'user';
  if (!status) {
    status = run(`systemctl status ${name}.service 2>/dev/null`, { fallback: '' });
    scope = 'system';
  }

  const journal = run(`journalctl --user -u ${name}.service --no-pager -n 20 2>/dev/null || journalctl -u ${name}.service --no-pager -n 20 2>/dev/null`, { fallback: '' });

  return { status, journal, scope };
}

// ==================== DOCKER ====================

function getDockerContainers() {
  const output = run('docker ps -a --format "{{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}" 2>/dev/null', { fallback: '' });
  if (!output) return [];

  return output.split('\n').filter(l => l.trim()).map(line => {
    const [name, status, image, ports] = line.split('\t');
    return {
      name,
      status,
      image,
      ports: ports || '',
      running: status.startsWith('Up'),
    };
  });
}

// ==================== COMMANDS ====================

const commands = {};

commands.status = function() {
  const crons = parseCrontab();
  const services = getSystemdServices();
  const containers = getDockerContainers();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    📊 CRON DASHBOARD                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  ${new Date().toLocaleString('en-GB', { timeZone: 'Europe/Oslo' })} CET\n`);

  // === Cron Jobs ===
  console.log(`\x1b[1m📅 CRON JOBS (${crons.filter(c => !c.disabled).length} active, ${crons.filter(c => c.disabled).length} disabled)\x1b[0m`);
  console.log('─'.repeat(100));
  console.log(`${padRight('NAME', 22)} ${padRight('SCHEDULE', 22)} ${padRight('LOG AGE', 12)} ${padRight('SIZE', 8)} ${padRight('ERRS', 5)} STATUS`);
  console.log('─'.repeat(100));

  for (const entry of crons) {
    const logInfo = entry.logFile ? analyzeLog(entry.logFile) : null;
    const health = getJobHealth(entry, logInfo);

    const name = padRight(entry.name || '?', 22);
    const sched = padRight(entry.human || entry.schedule, 22);
    const logAge = padRight(logInfo?.lastModifiedAgo || (entry.disabled ? '-' : 'no log'), 12);
    const size = padRight(logInfo?.sizeHuman || '-', 8);
    const errs = padRight(logInfo ? String(logInfo.recentErrors) : '-', 5);

    console.log(`${name} ${sched} ${logAge} ${size} ${errs} ${colorStatus(health)}`);
  }

  // === Services ===
  if (services.length) {
    console.log(`\n\x1b[1m⚙️  SYSTEMD SERVICES (${services.length})\x1b[0m`);
    console.log('─'.repeat(80));
    console.log(`${padRight('NAME', 30)} ${padRight('SCOPE', 8)} ${padRight('STATE', 12)} ${padRight('DESCRIPTION', 30)}`);
    console.log('─'.repeat(80));

    for (const svc of services) {
      const state = svc.active === 'active' ? 'active' : (svc.active === 'failed' ? 'failed' : 'inactive');
      console.log(`${padRight(svc.name, 30)} ${padRight(svc.scope, 8)} ${colorStatus(state)} ${padRight(svc.description, 30)}`);
    }
  }

  // === Docker ===
  if (containers.length) {
    console.log(`\n\x1b[1m🐳 DOCKER CONTAINERS (${containers.length})\x1b[0m`);
    console.log('─'.repeat(80));
    console.log(`${padRight('NAME', 25)} ${padRight('STATUS', 25)} ${padRight('IMAGE', 20)} PORTS`);
    console.log('─'.repeat(80));

    for (const c of containers) {
      const state = c.running ? 'active' : 'inactive';
      console.log(`${padRight(c.name, 25)} ${padRight(c.status, 25)} ${padRight(c.image, 20)} ${c.ports}`);
    }
  }

  // === Summary ===
  const activeJobs = crons.filter(c => !c.disabled);
  const healthyCrons = activeJobs.filter(c => {
    const log = c.logFile ? analyzeLog(c.logFile) : null;
    return getJobHealth(c, log) === 'healthy';
  }).length;
  const problemCrons = activeJobs.length - healthyCrons;
  const activeServices = services.filter(s => s.active === 'active').length;
  const runningContainers = containers.filter(c => c.running).length;

  console.log(`\n\x1b[1m📊 SUMMARY\x1b[0m`);
  console.log(`  Cron jobs:   ${healthyCrons}/${activeJobs.length} healthy${problemCrons > 0 ? ` (${problemCrons} need attention)` : ''}`);
  console.log(`  Services:    ${activeServices}/${services.length} active`);
  console.log(`  Containers:  ${runningContainers}/${containers.length} running`);
};

commands.crons = function() {
  const crons = parseCrontab();
  console.log(`\x1b[1m📅 All Crontab Entries (${crons.length})\x1b[0m\n`);

  for (const entry of crons) {
    const status = entry.disabled ? '  \x1b[90m[DISABLED]\x1b[0m' : '';
    const comment = entry.comment ? `  \x1b[36m// ${entry.comment}\x1b[0m` : '';
    console.log(`${entry.disabled ? '\x1b[90m' : '\x1b[1m'}${entry.name || 'unnamed'}\x1b[0m${status}${comment}`);
    console.log(`  Schedule: ${entry.human || entry.schedule}`);
    console.log(`  Command:  ${entry.command.slice(0, 120)}`);
    if (entry.logFile) console.log(`  Log:      ${entry.logFile}`);
    console.log();
  }
};

commands.services = function() {
  const services = getSystemdServices();
  const containers = getDockerContainers();

  if (services.length) {
    console.log(`\x1b[1m⚙️  Systemd Services\x1b[0m\n`);
    for (const svc of services) {
      const details = getServiceDetails(svc.name);
      console.log(`\x1b[1m${svc.name}\x1b[0m (${svc.scope})`);
      console.log(`  Status: ${colorStatus(svc.active === 'active' ? 'active' : (svc.active === 'failed' ? 'failed' : 'inactive'))}`);
      console.log(`  ${svc.description}`);
      // Recent journal entries
      if (details.journal) {
        const recent = details.journal.split('\n').slice(-3).join('\n  ');
        console.log(`  Recent: ${recent}`);
      }
      console.log();
    }
  }

  if (containers.length) {
    console.log(`\x1b[1m🐳 Docker Containers\x1b[0m\n`);
    for (const c of containers) {
      console.log(`  ${c.running ? '🟢' : '🔴'} ${c.name}: ${c.status} (${c.image})`);
    }
  }
};

commands.logs = function(args) {
  const nameFilter = args[0];
  const lines = parseInt(args.find(a => /^\d+$/.test(a))) || 30;

  const crons = parseCrontab();
  let targets = crons.filter(c => c.logFile);

  if (nameFilter) {
    targets = targets.filter(c =>
      (c.name && c.name.includes(nameFilter)) ||
      c.command.includes(nameFilter) ||
      c.logFile.includes(nameFilter)
    );
  }

  if (!targets.length) {
    console.log(nameFilter ? `No jobs matching "${nameFilter}" with log files.` : 'No jobs with log files found.');
    return;
  }

  for (const entry of targets) {
    const logInfo = analyzeLog(entry.logFile);
    console.log(`\x1b[1m📄 ${entry.name || entry.logFile}\x1b[0m`);
    console.log(`   Path: ${logInfo.path}`);
    console.log(`   Size: ${logInfo.sizeHuman || '?'} | Last modified: ${logInfo.lastModifiedAgo || '?'} | Lines: ${logInfo.totalLines || '?'}`);
    console.log('─'.repeat(80));

    if (logInfo.exists) {
      const content = run(`tail -${lines} "${logInfo.path}" 2>/dev/null`, { fallback: '[empty]' });
      console.log(content);
    } else {
      console.log('  [Log file not found]');
    }
    console.log();
  }
};

commands.health = function() {
  const crons = parseCrontab();
  const active = crons.filter(c => !c.disabled);

  console.log(`\x1b[1m🏥 Health Check — ${active.length} active jobs\x1b[0m\n`);

  let problems = 0;

  for (const entry of active) {
    const logInfo = entry.logFile ? analyzeLog(entry.logFile) : null;
    const health = getJobHealth(entry, logInfo);

    if (health === 'healthy') continue;

    problems++;
    console.log(`${colorStatus(health)} ${entry.name || 'unnamed'}`);
    console.log(`  Schedule: ${entry.human}`);

    if (health === 'stale') {
      console.log(`  ⏰ Log not updated in ${logInfo?.lastModifiedAgo || '?'} (expected every ${entry.intervalMinutes || '?'} min)`);
    }
    if (health === 'error' && logInfo?.recentErrorSamples?.length) {
      console.log(`  Recent errors (${logInfo.recentErrors} in last 100 lines):`);
      for (const err of logInfo.recentErrorSamples) {
        console.log(`    → ${err.slice(0, 150)}`);
      }
    }
    if (health === 'unknown') {
      console.log(`  No log file configured or found`);
    }

    // Suggestions
    if (health === 'stale') {
      console.log(`  💡 Suggestions:`);
      console.log(`    1. Check if the process is still running: ps aux | grep "${entry.name}"`);
      console.log(`    2. Try running manually: ${entry.command.slice(0, 100)}`);
      console.log(`    3. Check crontab is installed: crontab -l`);
    }
    if (health === 'error') {
      console.log(`  💡 Suggestions:`);
      console.log(`    1. Check full logs: tail -50 ${entry.logFile}`);
      console.log(`    2. Run manually to reproduce: ${entry.command.slice(0, 100)}`);
    }
    console.log();
  }

  if (problems === 0) {
    console.log('  \x1b[32m✅ All jobs healthy!\x1b[0m');
  } else {
    console.log(`\n${problems} job(s) need attention.`);
  }
};

commands.history = function(args) {
  const nameFilter = args[0];
  const crons = parseCrontab();
  let targets = crons.filter(c => c.logFile);

  if (nameFilter) {
    targets = targets.filter(c =>
      (c.name && c.name.includes(nameFilter)) ||
      c.logFile.includes(nameFilter)
    );
  }

  if (!targets.length) {
    console.log('No matching jobs with logs found.');
    return;
  }

  for (const entry of targets) {
    const logPath = entry.logFile.replace(/^~/, os.homedir());
    if (!fs.existsSync(logPath)) continue;

    console.log(`\x1b[1m📜 ${entry.name || 'unnamed'}\x1b[0m — ${entry.human}`);

    // Extract timestamps and group by day
    const content = run(`tail -500 "${logPath}" 2>/dev/null`, { fallback: '' });
    const lines = content.split('\n');
    const dayRuns = {};

    for (const line of lines) {
      const tsMatch = line.match(/(\d{4}-\d{2}-\d{2})/);
      if (tsMatch) {
        const day = tsMatch[1];
        dayRuns[day] = (dayRuns[day] || 0) + 1;
      }
    }

    const days = Object.entries(dayRuns).sort().reverse().slice(0, 14);
    if (days.length) {
      console.log('  Recent activity:');
      for (const [day, count] of days) {
        const bar = '█'.repeat(Math.min(count, 50));
        console.log(`    ${day}: ${bar} (${count})`);
      }
    } else {
      console.log('  No timestamped entries found');
    }
    console.log();
  }
};

commands.next = function(args) {
  const hours = parseInt(args[0]) || 6;
  const crons = parseCrontab();
  const runs = getNextRuns(crons, hours);

  console.log(`\x1b[1m⏭️  Next runs in ${hours} hours\x1b[0m\n`);

  if (!runs.length) {
    console.log('  No scheduled runs found.');
    return;
  }

  const tz = 'Europe/Oslo';
  for (const run of runs.slice(0, 30)) {
    const timeStr = run.time.toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = run.time.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
    console.log(`  ${dateStr} ${timeStr}  ${run.name}`);
  }

  if (runs.length > 30) console.log(`  ... and ${runs.length - 30} more`);
};

commands.errors = function(args) {
  const nameFilter = args[0];
  const crons = parseCrontab();
  let targets = crons.filter(c => c.logFile);

  if (nameFilter) {
    targets = targets.filter(c =>
      (c.name && c.name.includes(nameFilter)) ||
      c.logFile.includes(nameFilter)
    );
  }

  console.log(`\x1b[1m❌ Recent Errors\x1b[0m\n`);

  let totalErrors = 0;

  for (const entry of targets) {
    const logInfo = analyzeLog(entry.logFile);
    if (!logInfo.exists || logInfo.recentErrors === 0) continue;

    totalErrors += logInfo.recentErrors;
    console.log(`\x1b[31m${entry.name || 'unnamed'}\x1b[0m (${logInfo.recentErrors} errors in last 100 lines):`);
    for (const err of logInfo.recentErrorSamples) {
      console.log(`  → ${err.slice(0, 200)}`);
    }
    console.log();
  }

  if (totalErrors === 0) {
    console.log('  \x1b[32m✅ No recent errors found!\x1b[0m');
  }
};

commands.diagnose = function(args) {
  const nameFilter = args[0];
  if (!nameFilter) {
    console.error('Usage: cron-dash diagnose <job-name>');
    process.exit(1);
  }

  const crons = parseCrontab();
  const entry = crons.find(c =>
    (c.name && c.name.includes(nameFilter)) ||
    c.command.includes(nameFilter)
  );

  if (!entry) {
    console.error(`No job matching "${nameFilter}" found.`);
    process.exit(1);
  }

  console.log(`\x1b[1m🔍 Diagnosing: ${entry.name || 'unnamed'}\x1b[0m\n`);

  // Basic info
  console.log(`  Schedule:  ${entry.human} (${entry.schedule})`);
  console.log(`  Command:   ${entry.command}`);
  console.log(`  Disabled:  ${entry.disabled ? 'YES' : 'No'}`);
  console.log(`  Log file:  ${entry.logFile || 'none'}`);

  // Log analysis
  if (entry.logFile) {
    const logInfo = analyzeLog(entry.logFile);
    console.log(`\n  📄 Log Analysis:`);
    console.log(`    Exists:      ${logInfo.exists}`);
    console.log(`    Size:        ${logInfo.sizeHuman || '?'}`);
    console.log(`    Last update: ${logInfo.lastModifiedAgo || '?'}`);
    console.log(`    Total lines: ${logInfo.totalLines || '?'}`);
    console.log(`    Errors:      ${logInfo.recentErrors} (in last 100 lines)`);
    if (logInfo.lastLine) {
      console.log(`    Last line:   ${logInfo.lastLine.slice(0, 150)}`);
    }
  }

  // Check if script exists
  const scriptMatch = entry.command.match(/(?:node|python3?|bash|sh)\s+(\S+)/);
  if (scriptMatch) {
    const script = scriptMatch[1].replace(/^~/, os.homedir());
    const exists = fs.existsSync(script);
    console.log(`\n  📁 Script Check:`);
    console.log(`    Path:   ${script}`);
    console.log(`    Exists: ${exists ? '✅ Yes' : '❌ NO — THIS IS THE PROBLEM'}`);
    if (exists) {
      const stat = fs.statSync(script);
      console.log(`    Size:   ${humanSize(stat.size)}`);
      console.log(`    Perms:  ${(stat.mode & 0o777).toString(8)}`);
    }
  }

  // Check dependencies
  const binMatch = entry.command.match(/^(\S+)/);
  if (binMatch) {
    const bin = binMatch[1].replace(/\/usr\/bin\//, '');
    const which = run(`which ${bin} 2>/dev/null`, { fallback: '' });
    console.log(`\n  🔧 Binary Check:`);
    console.log(`    Binary: ${bin}`);
    console.log(`    Found:  ${which || '❌ NOT IN PATH'}`);
  }

  // Check if it's running right now
  const pgrep = run(`pgrep -f "${entry.name || entry.command.slice(0, 30)}" 2>/dev/null`, { fallback: '' });
  console.log(`\n  🏃 Process Check:`);
  console.log(`    Running now: ${pgrep ? `Yes (PID: ${pgrep.split('\n')[0]})` : 'No'}`);

  // Check disk space
  const df = run('df -h / | tail -1', { fallback: '' });
  console.log(`\n  💾 Disk: ${df}`);

  console.log(`\n  💡 Suggestions:`);
  console.log(`    1. Run manually: ${entry.command.slice(0, 120)}`);
  if (entry.logFile) {
    console.log(`    2. Watch live: tail -f ${entry.logFile}`);
    console.log(`    3. Clear log: > ${entry.logFile}`);
  }
};

commands.add = function(args) {
  if (args.length < 2) {
    console.error('Usage: cron-dash add "<schedule>" "<command>" [--name NAME]');
    console.error('Example: cron-dash add "*/15 * * * *" "node ~/scripts/check.cjs >> ~/logs/check.log 2>&1"');
    process.exit(1);
  }

  const schedule = args[0];
  const command = args[1];
  let name = '';

  const nameIdx = args.indexOf('--name');
  if (nameIdx >= 0 && args[nameIdx + 1]) name = args[nameIdx + 1];

  const comment = name ? `# ${name}\n` : '';
  const entry = `${comment}${schedule} ${command}`;

  const current = run('crontab -l 2>/dev/null', { fallback: '' });
  const updated = current ? `${current}\n${entry}` : entry;

  try {
    execSync(`echo "${updated.replace(/"/g, '\\"')}" | crontab -`, { encoding: 'utf8' });
    console.log(`✅ Added cron job: ${schedule} ${command.slice(0, 60)}`);
    if (name) console.log(`   Name: ${name}`);
  } catch (e) {
    console.error(`❌ Failed to add cron job: ${e.message}`);
  }
};

commands.remove = function(args) {
  const pattern = args[0];
  if (!pattern) { console.error('Usage: cron-dash remove <pattern>'); process.exit(1); }

  const current = run('crontab -l 2>/dev/null', { fallback: '' });
  const lines = current.split('\n');
  const removed = [];
  const kept = [];

  for (const line of lines) {
    if (line.includes(pattern)) {
      removed.push(line);
    } else {
      kept.push(line);
    }
  }

  if (!removed.length) {
    console.log(`No entries matching "${pattern}" found.`);
    return;
  }

  console.log(`Removing ${removed.length} entry/entries:`);
  for (const r of removed) console.log(`  - ${r.slice(0, 100)}`);

  try {
    execSync(`echo "${kept.join('\n').replace(/"/g, '\\"')}" | crontab -`, { encoding: 'utf8' });
    console.log(`✅ Removed.`);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
  }
};

commands.disable = function(args) {
  const pattern = args[0];
  if (!pattern) { console.error('Usage: cron-dash disable <pattern>'); process.exit(1); }

  const current = run('crontab -l 2>/dev/null', { fallback: '' });
  const lines = current.split('\n');
  let count = 0;

  const updated = lines.map(line => {
    if (line.includes(pattern) && !line.startsWith('#')) {
      count++;
      return `# ${line}`;
    }
    return line;
  });

  if (!count) { console.log(`No active entries matching "${pattern}".`); return; }

  execSync(`echo "${updated.join('\n').replace(/"/g, '\\"')}" | crontab -`, { encoding: 'utf8' });
  console.log(`✅ Disabled ${count} entry/entries matching "${pattern}"`);
};

commands.enable = function(args) {
  const pattern = args[0];
  if (!pattern) { console.error('Usage: cron-dash enable <pattern>'); process.exit(1); }

  const current = run('crontab -l 2>/dev/null', { fallback: '' });
  const lines = current.split('\n');
  let count = 0;

  const updated = lines.map(line => {
    if (line.includes(pattern) && line.startsWith('#')) {
      const uncommented = line.replace(/^#+\s*/, '');
      // Check if it looks like a cron line
      if (/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+/.test(uncommented)) {
        count++;
        return uncommented;
      }
    }
    return line;
  });

  if (!count) { console.log(`No disabled entries matching "${pattern}".`); return; }

  execSync(`echo "${updated.join('\n').replace(/"/g, '\\"')}" | crontab -`, { encoding: 'utf8' });
  console.log(`✅ Enabled ${count} entry/entries matching "${pattern}"`);
};

commands.export = function() {
  const crons = parseCrontab();
  const services = getSystemdServices();
  const containers = getDockerContainers();

  const data = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    crons: crons.map(c => {
      const logInfo = c.logFile ? analyzeLog(c.logFile) : null;
      return {
        ...c,
        health: getJobHealth(c, logInfo),
        log: logInfo ? {
          exists: logInfo.exists,
          size: logInfo.size,
          lastModified: logInfo.lastModified,
          recentErrors: logInfo.recentErrors,
        } : null,
      };
    }),
    services,
    containers,
  };

  console.log(JSON.stringify(data, null, 2));
};

// ==================== MAIN ====================

const cmd = process.argv[2];
const args = process.argv.slice(3);

if (!cmd || cmd === '--help' || cmd === '-h') {
  console.log(`Cron Dashboard — Unified view of scheduled jobs and services

Usage: cron-dash <command> [args...]

Commands:
  status                Full dashboard (crons + services + docker + health)
  crons                 List all crontab entries with schedule details
  services              List systemd services and docker containers
  logs [name] [lines]   Show recent log output for a job
  health                Health check all jobs (log freshness, errors)
  history [name]        Show run activity heatmap from logs
  next [hours]          Show upcoming cron runs (default: 6 hours)
  errors [name]         Show recent errors across all job logs
  diagnose <name>       Deep diagnosis of a specific job
  add <sched> <cmd>     Add a new cron job [--name NAME]
  remove <pattern>      Remove cron entries matching pattern
  disable <pattern>     Comment out entries (disable without removing)
  enable <pattern>      Uncomment entries (re-enable)
  export                Export full dashboard as JSON`);
  process.exit(0);
}

if (commands[cmd]) {
  commands[cmd](args);
} else {
  console.error(`Unknown command: "${cmd}". Run "cron-dash --help" for usage.`);
  process.exit(1);
}
