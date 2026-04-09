---
name: project-scaffold
description: "Scaffold new projects from templates: Node.js, Python, React, API server, CLI tool, monorepo."
---

# project-scaffold

Scaffold new projects from templates: Node.js, Python, React, API server, CLI tool, monorepo.

## Use When

- Starting a new project from scratch
- Creating boilerplate and project structure
- Setting up git, package.json, pyproject.toml
- Generating standard configs (.gitignore, eslint, prettier, etc.)
- Need a consistent project structure

## Scripts

### scaffold.sh

Generate a complete project structure from a template type.

```bash
bash scripts/scaffold.sh <type> <name> [--dir <output-dir>]
```

**Types:** `node`, `python`, `react`, `api`, `cli`, `monorepo`

Examples:

```bash
bash scripts/scaffold.sh node my-app
bash scripts/scaffold.sh python data-pipeline --dir /tmp/projects
bash scripts/scaffold.sh api user-service
bash scripts/scaffold.sh react dashboard
bash scripts/scaffold.sh cli mytool
bash scripts/scaffold.sh monorepo platform
```

### config-gen.sh

Generate individual config files for an existing project.

```bash
bash scripts/config-gen.sh <config-type> [--dir <project-dir>]
```

**Config types:** `gitignore-node`, `gitignore-python`, `eslint`, `prettier`, `tsconfig`, `dockerfile-node`, `dockerfile-python`, `github-ci`

## References

- `references/project-templates.md` — Structure specs for each project type
- `references/standard-configs.md` — Standard config file contents
- `references/recommended-deps.md` — Recommended dependencies by project type
