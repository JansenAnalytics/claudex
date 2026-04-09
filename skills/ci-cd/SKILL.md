---
name: ci-cd
description: "Create and debug GitHub Actions CI/CD pipelines: workflow authoring, matrix builds, caching, secrets, deployment steps."
---

# ci-cd

Create and debug GitHub Actions CI/CD pipelines: workflow authoring, matrix builds, caching, secrets, deployment steps.

## When to Use

- Setting up CI/CD for a new project
- Writing GitHub Actions workflows
- Debugging failed CI runs
- Optimizing build times and caching
- Adding deployment steps
- Configuring matrix builds

## Scripts

### `scripts/generate-workflow.sh <template> [options]`

Generate a GitHub Actions workflow from templates. Templates: `node`, `python`, `docker`, `rust`, `go`.

```bash
bash scripts/generate-workflow.sh node --name "CI" --node-version "18,20,22"
bash scripts/generate-workflow.sh python --name "Test" --python-version "3.11,3.12"
bash scripts/generate-workflow.sh docker --name "Build" --registry ghcr.io
```

### `scripts/lint-workflow.sh [path]`

Lint GitHub Actions workflow YAML files for common errors (invalid keys, bad expressions, missing required fields).

```bash
bash scripts/lint-workflow.sh .github/workflows/ci.yml
bash scripts/lint-workflow.sh .github/workflows/  # lint all
```

### `scripts/cache-optimizer.sh [path]`

Analyze workflows and suggest caching improvements (dependency caches, build caches, artifact strategies).

```bash
bash scripts/cache-optimizer.sh .github/workflows/ci.yml
```

## References

- `references/actions-syntax.md` — GitHub Actions workflow syntax quick reference
- `references/common-workflows.md` — Ready-to-use workflow snippets
- `references/matrix-strategies.md` — Matrix build patterns and fail-fast configs
- `references/caching-patterns.md` — Caching strategies by ecosystem

## Tips

- Always pin action versions to full SHA for security (e.g., `actions/checkout@v4` minimum)
- Use `concurrency` groups to cancel redundant runs on push
- Cache `node_modules` / `.venv` / `target/` for faster builds
- Use `if: always()` for cleanup steps that must run
- Set `timeout-minutes` on jobs to prevent hung builds
