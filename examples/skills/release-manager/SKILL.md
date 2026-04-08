---
name: release-manager
description: "Manage releases: semantic versioning, changelog generation, GitHub releases, git tags, version bumping."
---

# release-manager

Manage releases: semantic versioning, changelog generation, GitHub releases, git tags, version bumping.

## When to Use

- Creating releases or preparing for a release
- Generating changelogs from git commit history
- Bumping version numbers (major/minor/patch)
- Tagging releases in git
- Publishing GitHub releases via `gh` CLI

## Scripts

### changelog-gen.sh

Generate a changelog from git commits using conventional commit format.

```bash
bash scripts/changelog-gen.sh --since v1.0.0
bash scripts/changelog-gen.sh --since v1.0.0 --output CHANGELOG.md
bash scripts/changelog-gen.sh --since HEAD~20 --format json
```

**Arguments:**

- `--since <tag|commit>` — Starting point (default: last tag)
- `--output <file>` — Write to file instead of stdout
- `--format markdown|json` — Output format (default: markdown)

Groups commits into: Features, Bug Fixes, Breaking Changes, Other.
Falls back to listing all commits if no conventional commits found.

### version-bump.sh

Bump semantic version in project files.

```bash
bash scripts/version-bump.sh --bump patch
bash scripts/version-bump.sh --bump minor --commit
bash scripts/version-bump.sh --bump 2.0.0
bash scripts/version-bump.sh --dry-run
```

**Arguments:**

- `--bump major|minor|patch|<version>` — What to bump (required)
- `--commit` — Git commit + tag after bumping
- `--dry-run` — Show what would happen without changing anything

Detects version from: package.json, pyproject.toml, Cargo.toml, VERSION file.

### gh-release.sh

Create a GitHub release using the `gh` CLI.

```bash
bash scripts/gh-release.sh --version v1.2.0
bash scripts/gh-release.sh --version v1.2.0 --notes "Release notes here"
bash scripts/gh-release.sh --version v2.0.0-rc.1 --prerelease --draft
```

**Arguments:**

- `--version <version>` — Version/tag to release (required)
- `--notes <text>` — Release notes (default: auto-generate from changelog)
- `--draft` — Create as draft
- `--prerelease` — Mark as pre-release

## References

- `semver-guide.md` — Semantic versioning rules, conventional commits spec
- `release-checklist.md` — Pre-release checklist

## Requirements

- `git` — For commit parsing and tagging
- `gh` CLI — For GitHub releases (at ~/.local/bin/gh)
- `jq` — For JSON parsing (optional)
