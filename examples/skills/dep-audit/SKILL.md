---
name: dep-audit
description: "Audit and update project dependencies: find outdated packages, check for vulnerabilities, auto-update safely with lockfile regeneration."
---

# dep-audit

Audit and update project dependencies: find outdated packages, check for vulnerabilities, auto-update safely with lockfile regeneration.

## When to Use

- Checking for outdated dependencies
- Scanning for CVEs / security vulnerabilities
- Updating packages safely (minor/patch)
- Managing dependency conflicts
- Regenerating lockfiles after updates

## Supported Ecosystems

| Ecosystem     | Lockfile                                       | Audit            | Outdated | Update |
| ------------- | ---------------------------------------------- | ---------------- | -------- | ------ |
| npm/yarn/pnpm | package-lock.json / yarn.lock / pnpm-lock.yaml | ✅               | ✅       | ✅     |
| pip           | requirements.txt / Pipfile.lock                | ✅ (pip-audit)   | ✅       | ✅     |
| cargo         | Cargo.lock                                     | ✅               | ✅       | ✅     |
| go            | go.sum                                         | ✅ (govulncheck) | ✅       | ✅     |

## Scripts

### `scripts/dep-check.sh [path]`

Universal dependency checker. Auto-detects ecosystem, runs security audit, and lists outdated packages.

```bash
bash scripts/dep-check.sh /path/to/project
```

### `scripts/safe-update.sh [path] [--major]`

Safely updates dependencies (minor/patch by default). Creates a git stash before updating, regenerates lockfile. Use `--major` for major version bumps (interactive confirmation).

```bash
bash scripts/safe-update.sh /path/to/project
bash scripts/safe-update.sh /path/to/project --major
```

### `scripts/outdated.sh [path]`

Lists all outdated dependencies with current vs latest versions, grouped by severity (patch/minor/major).

```bash
bash scripts/outdated.sh /path/to/project
```

## References

- `references/update-strategies.md` — Safe update workflows and strategies
- `references/semver-guide.md` — Semver rules and common gotchas
- `references/breaking-changes.md` — Common breaking changes by ecosystem

## Tips

- Always run `dep-check.sh` before `safe-update.sh` to understand the landscape
- For monorepos, run from the root — scripts detect workspace configs
- Use `--major` flag with caution; review changelogs first
- After updating, run the project's test suite to verify nothing broke
