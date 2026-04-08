---
name: test-critic
user-invocable: false
description: Evaluates test quality — coverage analysis, mutation testing (do tests actually catch bugs?), test gap detection, and test code quality scoring. Supports Jest, Vitest, pytest. Use after writing tests to verify they're meaningful.
triggers:
  - test quality
  - check tests
  - test coverage
  - mutation testing
  - test critic
---

# test-critic

Evaluates test quality — not just "do tests pass" but "do tests actually catch bugs?"

## Quick Start

```bash
# Full audit
test-critic /path/to/project --full

# Quick (coverage only, no mutations)
test-critic /path/to/project --quick

# Individual scripts
node ~/openclaw/skills/test-critic/scripts/coverage.cjs /path/to/project
node ~/openclaw/skills/test-critic/scripts/gaps.cjs /path/to/project
node ~/openclaw/skills/test-critic/scripts/quality.cjs /path/to/project
node ~/openclaw/skills/test-critic/scripts/mutate.cjs /path/to/project --limit 50
node ~/openclaw/skills/test-critic/scripts/report.cjs /path/to/project
```

## Options

| Flag | Description |
|------|-------------|
| `--quick` | Coverage + gaps + quality only (no mutations) |
| `--full` | Everything including mutation testing |
| `--framework jest\|vitest\|pytest\|auto` | Test framework (default: auto-detect) |
| `--mutate-limit N` | Max mutations to try (default: 100) |
| `--output-dir DIR` | Where to write reports |
| `--format md\|json\|both` | Report format |

## Components

1. **coverage.cjs** — Runs tests with coverage, identifies untested files, happy-path-only files, critical files with low coverage
2. **mutate.cjs** — Lightweight mutation testing: modifies source code and checks if tests catch the change
3. **gaps.cjs** — Static analysis to find untested error handlers, null checks, boundary conditions, division-by-zero
4. **quality.cjs** — Analyzes test code itself: missing assertions, poor names, excessive mocking, hardcoded sleeps
5. **review.cjs** — Orchestrator that runs all components and generates final report
6. **report.cjs** — Combines all results into scored report with prioritized test suggestions

## Output

- `coverage-analysis.json` — Coverage breakdown
- `test-gaps.json` — Identified test gaps with suggestions
- `test-quality.json` — Test code quality issues
- `mutation-results.json` — Mutation testing results
- `test-critic-report.json` — Combined report with health score
- `test-critic-report.md` — Human-readable markdown report

## Supported Frameworks

- Jest (auto-detected)
- Vitest
- Node.js test runner
- pytest

## Dependencies

Node.js built-in modules only. Shells out to test runners.
