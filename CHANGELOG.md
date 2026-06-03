# Changelog

Notable changes to the Claudex reference implementation. This documents a
showcase/reference repo rather than a versioned package, so entries are grouped
by date. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## 2026-06-03 — Portability & extension-surface release

### Added
- **Categorized skill set (160 skills)** — every `SKILL.md` now carries
  `category` / `maturity` / `tags` frontmatter against a 15-category controlled
  vocabulary. Skills that need helper code ship their vendored `scripts/`, and
  those that wrap an external project ship an `INSTALL.md` with env-var setup.
- **Slash commands** (`commands/`) — 12 user-triggered commands including
  `/audit`, `/briefing`, `/recap`, `/remember`, `/project`, `/cron`, and a
  guard-railed `/ship`.
- **Lifecycle hooks** (`hooks/`) — `auto-git-add`, `lint-on-write`,
  `notify-on-error`, `snapshot-on-stop`.
- **MCP registry** (`mcp/`) — 11 ready-to-use server configs plus `install.sh`
  to deep-merge them into a project `.mcp.json`.
- **Recommended marketplace plugins** (`plugins/recommended.md`).
- **Three new sub-agents** — `tester`, `incident-responder`, `documentarian`
  (9 agents total).
- **Skill tooling** — `scripts/skill-audit.sh` (frontmatter + path-leak audit)
  and `scripts/skill-index.sh` (generates `data/skill-index.json` and
  `docs/skills-catalog.md`).
- **Guide docs** — `commands-guide`, `hooks-guide`, `mcp-guide`,
  `plugins-guide`, and `skill-anatomy`.
- **`templates/settings.json.example`** — an annotated, safe-by-default
  permissions reference alongside the autonomous default.

### Changed
- **Model → Opus 4.8** across agent definitions, launch scripts, and docs.
- **Zero-click first start** — `bootstrap.sh` now pre-approves the two one-time
  gates (`skipDangerousModePermissionPrompt` and the per-project
  `hasTrustDialogAccepted`) so a fresh, headless install runs with no interactive
  prompts.
- **Permissions documentation** — clarified that `bypassPermissions` is the
  intended default for a headless Telegram agent (no terminal to approve
  prompts), with the `deny` list as the guardrail that is enforced even in
  bypass mode.
- **Portability** — machine-specific absolute paths replaced with `$HOME` /
  per-project env-var defaults across skills, scripts, and docs.

### Removed
- Private, workspace-only skills are excluded from the public showcase via
  `private: true` frontmatter plus a `.sync-exclude` safety net.

### Security
- Repo-wide privacy pass: home paths, personal identifiers, example data, and
  third-party references genericized; commit history normalized to a single
  public identity.

## Earlier

- Multi-provider RAG memory search, health metrics, task inbox, and lifecycle
  hooks.
- Three-layer persistence (tmux + systemd + watchdog cron).
- Telegram channel integration and the initial skill library.
- Initial Claudex showcase: single-file `CLAUDE.md` identity, sub-agents, and
  the architecture writeup.
