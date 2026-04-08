---
name: migration-planner
description: "Plan and execute framework, language, or infrastructure migrations safely: version upgrades, framework swaps, API changes."
---

# migration-planner

Plan and execute framework, language, or infrastructure migrations safely: version upgrades, framework swaps, API changes.

## When to Use

- Upgrading Node.js or Python versions
- Migrating between frameworks (Express→Fastify, React→Next.js, etc.)
- Planning database migrations
- Modernizing legacy codebases
- Any breaking-change upgrade

## How It Works

1. Run `checklist-gen.sh` to generate a migration checklist for your scenario
2. Use `breaking-changes.sh` to scan for potential breaking changes
3. Use `rollback-plan.sh` to generate a rollback plan
4. Consult references for common patterns and anti-patterns

## Scripts

| Script                | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `checklist-gen.sh`    | Generate a migration checklist for a specific migration type  |
| `breaking-changes.sh` | Detect potential breaking changes between versions/frameworks |
| `rollback-plan.sh`    | Generate a rollback plan template                             |

## References

| File                   | Content                          |
| ---------------------- | -------------------------------- |
| `common-migrations.md` | Common migration paths with tips |
| `anti-patterns.md`     | Migration anti-patterns to avoid |

## Example Usage

```bash
# Generate a migration checklist
bash scripts/checklist-gen.sh --from "node16" --to "node20" --type runtime

# Detect breaking changes in package.json
bash scripts/breaking-changes.sh --path /path/to/project --from "16.0.0" --to "20.0.0"

# Generate rollback plan
bash scripts/rollback-plan.sh --name "Node 20 upgrade" --steps "Update .nvmrc,Update CI config,Update Dockerfile" --output rollback.md
```
