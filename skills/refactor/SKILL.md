---
name: refactor
description: "Large-scale codebase restructuring: rename, extract, inline, move modules, update imports. Use when: restructuring project layout, extracting components/functions, renaming across files, splitting ..."
---

# refactor

Large-scale codebase restructuring: rename, extract, inline, move modules, update imports. Use when: restructuring project layout, extracting components/functions, renaming across files, splitting monoliths, or modernizing legacy code patterns.

## Usage

### Dead Code Finder

```bash
bash scripts/dead-code-finder.sh [path]
```

Finds exported functions/classes that are never imported elsewhere.

### Import Path Updater

```bash
bash scripts/import-updater.sh <old-path> <new-path> [search-dir]
```

Updates all import/require statements when a module is moved.

### Dependency Graph

```bash
bash scripts/dep-graph.sh [path]
```

Builds a text-based dependency graph showing which files import which.

## When to Use

- Moving files/modules and updating all imports
- Finding dead code before cleanup
- Understanding dependency structure before restructuring
- Extracting components from a monolith
- Renaming modules across a codebase

## Safe Refactoring Workflow

1. Run `dep-graph.sh` to understand current structure
2. Run `dead-code-finder.sh` to identify removable code
3. Make structural changes
4. Run `import-updater.sh` to fix import paths
5. Run tests to verify nothing broke

## Resources

- `scripts/dead-code-finder.sh` — Find unused exports
- `scripts/import-updater.sh` — Update import paths after moves
- `scripts/dep-graph.sh` — Build dependency graph
- `references/refactoring-patterns.md` — Common refactoring patterns
- `references/safe-refactoring-steps.md` — Step-by-step safe refactoring
