---
name: doc-verifier
user-invocable: false
description: Ensures documentation is accurate, complete, and actually works — catches documentation rot before users hit it. Validates code examples, checks links, compares API/CLI docs against reality, detects stale docs, and scores completeness.
triggers:
  - check the docs
  - verify documentation
  - doc review
  - documentation audit
  - are the docs accurate
  - link check
  - stale docs
  - doc health
  - documentation completeness
---

# Doc Verifier

Catches documentation rot before users hit it. Validates everything: code examples actually run, links resolve, API docs match reality, CLI flags exist, and docs stay fresh.

**Scripts:** `~/openclaw/skills/doc-verifier/scripts/`
**Binary:** `~/bin/doc-verifier`

## Quick Reference

```bash
S=~/openclaw/skills/doc-verifier/scripts

# Full review of a project
doc-verifier ~/my-project

# Quick check (links + freshness only)
doc-verifier ~/my-project --quick

# Full audit including code execution
doc-verifier ~/my-project --full

# With API comparison
doc-verifier ~/my-project --api-url http://localhost:3000

# With CLI comparison
doc-verifier ~/my-project --cli-cmd "node ~/my-project/cli.js"

# Output to separate directory
doc-verifier ~/my-project --output-dir /tmp/doc-review

# JSON format
doc-verifier ~/my-project --format json

# Compare with previous review
doc-verifier ~/my-project --compare /tmp/previous-review

# Individual scripts
node $S/links.cjs ~/my-project
node $S/freshness.cjs ~/my-project
node $S/completeness.cjs ~/my-project
node $S/examples.cjs ~/my-project
node $S/api-docs.cjs ~/my-project --api-url http://localhost:3000
node $S/cli-docs.cjs ~/my-project --cli-cmd "mycli"
node $S/report.cjs /tmp/output-dir --format md
```

## Scripts

### 1. `examples.cjs` — Code Example Validator
Extracts fenced code blocks from markdown and executes them:
- **bash/sh**: Runs commands, checks exit codes. Skips dangerous commands (rm, drop, delete).
- **js/javascript**: Writes to temp file, runs with Node. Checks syntax/runtime errors.
- **python**: Writes to temp file, runs with python3.
- Skips blocks marked `<!-- skip-verify -->` or data blocks (text, json, yaml, etc.)
- Output: `examples-report.json`

### 2. `links.cjs` — Link Checker
- External URLs: HEAD request, checks status codes
- Internal links: verifies file exists
- Anchor links: verifies heading exists
- Cross-file anchors: verifies both file and heading
- Image references: verifies image exists
- Rate limited (5 req/sec), configurable timeout/retries
- Output: `links-report.json`

### 3. `api-docs.cjs` — API Documentation vs Reality
- Extracts endpoints from markdown (GET /path patterns) and OpenAPI specs
- Hits actual API to verify endpoints exist
- Output: `api-docs-report.json`

### 4. `cli-docs.cjs` — CLI Documentation Checker
- Extracts flags from docs, runs `--help` on actual CLI
- Compares: matching, in-docs-not-CLI, in-CLI-not-docs
- Output: `cli-docs-report.json`

### 5. `freshness.cjs` — Documentation Freshness
- Compares doc vs source modification dates
- Detects: TODO/FIXME/TBD, empty sections, broken formatting, version mismatches
- Output: `freshness-report.json`

### 6. `completeness.cjs` — Documentation Completeness
- Checks for: README sections, CHANGELOG, contributing guide, .env.example, JSDoc coverage
- Scores 0-100
- Output: `completeness-report.json`

### 7. `review.cjs` — Full Audit Orchestrator
Options: `--quick`, `--full`, `--api-url`, `--cli-cmd`, `--no-execute`, `--output-dir`, `--compare`, `--format md|json`

### 8. `report.cjs` — Report Generator
- Aggregates all reports into prioritized issue list
- Health Score 0-100
- Top 10 fixes needed with severity indicators
- Output: `doc-health-report.md` or `doc-health-report.json`

## Dependencies
Node.js built-in modules only. No npm install required.

## Output
All reports are JSON. The final report is also available as markdown. Health Score ranges from 0-100.
