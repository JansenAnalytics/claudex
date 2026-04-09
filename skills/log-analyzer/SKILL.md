---
name: log-analyzer
description: "Parse and analyze application logs: pattern matching, error extraction, correlation with timestamps, frequency analysis, anomaly detection. Use when: diagnosing production issues, finding error pat..."
---

# log-analyzer

Parse and analyze application logs: pattern matching, error extraction, correlation with timestamps, frequency analysis, anomaly detection. Use when: diagnosing production issues, finding error patterns in logs, correlating errors with deployments, analyzing log frequency/trends, or filtering noise from large log files.

## Scripts

### log-parse.py

Universal log parser with auto-format detection and filtering.

```bash
# Basic usage
python3 scripts/log-parse.py --input app.log

# Filter by level
python3 scripts/log-parse.py --input app.log --level error,warn

# Time-based filter
python3 scripts/log-parse.py --input app.log --since "2024-01-15 14:00"

# Pattern matching
python3 scripts/log-parse.py --input app.log --grep "database" --exclude "health"

# Markdown output
python3 scripts/log-parse.py --input app.log --level error --format markdown
```

Auto-detects: JSON logs, syslog, nginx access/error, Node.js console, Python logging.

### error-summary.py

Aggregates and groups errors from log files.

```bash
python3 scripts/error-summary.py --input app.log --top 20
python3 scripts/error-summary.py --input app.log --input server.log --top 10
```

Groups by fuzzy-matched error message (strips variable parts like IDs, timestamps). Reports: unique count, first/last occurrence, frequency, sample stack trace.

### log-correlator.sh

Correlates events across multiple log files within a time window.

```bash
bash scripts/log-correlator.sh --logs "app.log,nginx.log,system.log" --time "2024-01-15 14:32" --window 5m
```

## References

- `references/log-formats.md` — Common log format patterns with regex
- `references/troubleshooting-guide.md` — Systematic troubleshooting with logs
