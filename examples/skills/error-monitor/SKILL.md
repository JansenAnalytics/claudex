---
name: error-monitor
description: "Monitor application logs and stderr in real-time for errors, crashes, and exceptions. Auto-capture stack traces, alert on new error patterns, track error rates."
---

# error-monitor

Monitor application logs and stderr in real-time for errors, crashes, and exceptions. Auto-capture stack traces, alert on new error patterns, track error rates.

## When to Use

- Running dev servers and watching for errors
- Monitoring background services
- Catching runtime exceptions during testing
- Tracking error frequency over time
- Generating crash reports when processes die

## Scripts

### watch-errors.sh

Real-time log watcher that filters for error patterns and captures stack traces.

```bash
# Watch specific log files
bash scripts/watch-errors.sh --files "app.log,error.log"

# Pipe mode — capture stderr from a process
node server.js 2>&1 | bash scripts/watch-errors.sh

# With sound alert on each error
bash scripts/watch-errors.sh --files "app.log" --sound

# Execute a command on each error (e.g., notify)
bash scripts/watch-errors.sh --files "app.log" --exec "echo 'Error found!' >> alerts.txt"

# Custom output file
bash scripts/watch-errors.sh --files "app.log" --output /tmp/my-errors.jsonl
```

**Error patterns detected:** ERROR, FATAL, Exception, Traceback, panic, SIGTERM, SIGSEGV, SIGABRT, "unhandled", "uncaught", "segmentation fault", "core dumped", "out of memory", "killed"

**Output format:** JSONL file `errors-YYYY-MM-DD.jsonl` with fields:

- `timestamp` — ISO 8601
- `source` — file or "stdin"
- `level` — ERROR, FATAL, EXCEPTION, CRASH
- `message` — the error line
- `stack` — captured stack trace (if multi-line)
- `pattern` — which pattern matched

### error-rate.py

Analyze error frequency from JSONL files produced by watch-errors.

```bash
# Analyze today's errors
python3 scripts/error-rate.py errors-2026-03-07.jsonl

# Analyze multiple files
python3 scripts/error-rate.py errors-*.jsonl

# Output CSV for charting
python3 scripts/error-rate.py errors-*.jsonl --csv error-rates.csv

# Group by minute instead of hour
python3 scripts/error-rate.py errors-*.jsonl --interval minute
```

**Reports:** errors per interval, trend direction, busiest period, spike detection (>2σ from mean).

### crash-report.sh

Generate a structured crash report when a process dies.

```bash
# By PID
bash scripts/crash-report.sh --pid 12345

# By process name
bash scripts/crash-report.sh --name "node server.js"

# With log file context
bash scripts/crash-report.sh --pid 12345 --log app.log

# Custom number of log lines
bash scripts/crash-report.sh --pid 12345 --log app.log --lines 100
```

**Output:** Markdown crash report with exit code, signal, stderr tail, log context, system state (memory, disk, load average).

## References

- `references/error-patterns.md` — Common error patterns by language/framework with explanations and fixes

## Output Files

All output goes to the current directory by default:

- `errors-YYYY-MM-DD.jsonl` — captured errors from watch-errors
- `crash-report-PID-TIMESTAMP.md` — crash reports
- `error-rates.csv` — optional CSV from error-rate analysis
