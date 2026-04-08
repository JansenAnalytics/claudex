---
name: codebase-navigator
description: "Rapidly understand any codebase: identify entry points, map architecture, find key patterns, summarize modules, trace data flow."
---

# codebase-navigator

Rapidly understand any codebase: identify entry points, map architecture, find key patterns, summarize modules, trace data flow.

## When to Use

- Onboarding to a new project
- Understanding unfamiliar code
- Finding where functionality lives
- Mapping dependencies between modules
- Creating architectural overviews

## Scripts

### codebase-scan.sh

Quick codebase overview — detects languages, frameworks, entry points, file counts.

```bash
bash scripts/codebase-scan.sh /path/to/project
bash scripts/codebase-scan.sh .
```

**Output:** Markdown summary with languages, frameworks, entry points, directory structure, LOC counts.

### module-map.py

Build a module/import dependency map.

```bash
python3 scripts/module-map.py --dir src/
python3 scripts/module-map.py --dir src/ --format mermaid
python3 scripts/module-map.py --dir lib/ --format json
```

**Arguments:**

- `--dir <path>` — Directory to scan (default: `.`)
- `--format tree|mermaid|json` — Output format (default: tree)

Identifies: core modules (most imported), leaf modules, circular dependencies.

### trace-flow.sh

Trace a function/symbol through the codebase.

```bash
bash scripts/trace-flow.sh --symbol "handlePayment" --dir src/
bash scripts/trace-flow.sh --symbol "UserService" --depth 3
```

**Arguments:**

- `--symbol <name>` — Function/class/string to trace (required)
- `--dir <path>` — Directory to search (default: `.`)
- `--depth <n>` — Call chain depth (default: 2)

Uses `rg` (ripgrep) for fast searching.

## References

- `codebase-patterns.md` — Common project structures and how to identify them

## Requirements

- `rg` (ripgrep) — For fast code searching
- `python3` — For module-map.py
