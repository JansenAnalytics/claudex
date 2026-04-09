---
name: architecture-critic
user-invocable: false
description: Static code analysis like a senior developer — cyclomatic/cognitive complexity, dead code detection, dependency graph analysis (circular deps, god modules), pattern consistency, error handling audit, code duplication detection. Use during refactors or before shipping.
triggers:
  - code review
  - architecture review
  - code quality
  - complexity check
  - dead code
  - arch critic
---

# Architecture Critic

Static code analysis that thinks like a senior developer — complexity, dead code, dependency graphs, patterns, error handling, duplication.

## Quick Start

```bash
# Full review
arch-critic /path/to/project

# Quick review (complexity + dead code only)
arch-critic /path/to/project --quick

# Individual analyzers
node ~/openclaw/skills/architecture-critic/scripts/complexity.cjs /path/to/project
node ~/openclaw/skills/architecture-critic/scripts/deadcode.cjs /path/to/project
node ~/openclaw/skills/architecture-critic/scripts/deps.cjs /path/to/project
node ~/openclaw/skills/architecture-critic/scripts/patterns.cjs /path/to/project
node ~/openclaw/skills/architecture-critic/scripts/errors.cjs /path/to/project
node ~/openclaw/skills/architecture-critic/scripts/duplication.cjs /path/to/project
```

## Scripts

| Script | Purpose | Output |
|--------|---------|--------|
| `complexity.cjs` | Cyclomatic/cognitive complexity, function length, nesting depth | complexity-report.json |
| `deadcode.cjs` | Dead exports, unused variables, unreachable code, tech debt markers | deadcode-report.json |
| `deps.cjs` | Import graph, circular deps, god modules, coupling metrics | dependency-graph.json |
| `patterns.cjs` | Code style consistency (quotes, semis, naming, async patterns) | patterns-report.json |
| `errors.cjs` | Error handling audit (empty catches, unhandled promises) | error-handling-report.json |
| `duplication.cjs` | Duplicate code blocks via normalized hashing | duplication-report.json |
| `review.cjs` | Orchestrator — runs all analyzers | All reports + combined |
| `report.cjs` | Report generator — health score 0-100, top refactors | architecture-review.json/md |

## Options

```
--quick              Complexity + dead code only
--full               All analyzers (default)
--format md|json     Output format (default: json)
--output-dir DIR     Where to write reports
--max-complexity N   Cyclomatic complexity threshold (default: 10)
--ignore PATTERN     Glob pattern to ignore (repeatable)
--block-size N       Duplication block size in lines (default: 6)
```

## Health Score

Weighted 0-100 across all categories. Grade: A (90+), B (75+), C (60+), D (40+), F (<40).

## Languages

- JavaScript/TypeScript (.js, .cjs, .mjs, .ts, .tsx, .jsx)
- Python (.py) — complexity analysis only

## Dependencies

None. Only Node.js built-in modules (fs, path, crypto, child_process).
